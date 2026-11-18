import { timingSafeEqual } from 'crypto';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import {
  hashSecret,
  normalizeEnrollmentCode,
} from '../../common/secrets/secret-codes';
import { PolicyConfig } from '../../config/policy.config';
import { ClockPort } from '../../infra/clock/clock.port';
import { DbService, type Tx } from '../../infra/db/db.service';
import { AuditService } from '../audit/audit.service';
import { toAccountContext, type Principal } from '../identity/principal';
import { AccessService } from '../profiles/access.service';
import type { ClaimCaneDto } from './dto/claim-cane.dto';

export interface CaneView {
  id: string;
  serial: string;
  model: string;
  firmwareVersion: string | null;
  assignment: { id: string; profileId: string; startedAt: string };
  gateway: {
    installationId: string;
    isThisInstallation: boolean;
    startedAt: string;
    lastEventAt: string | null;
  } | null;
  telemetry: {
    batteryPct: number | null;
    charging: boolean | null;
    sensorStatus: string | null;
    linkStatus: string | null;
    capturedAt: string;
    ageSeconds: number;
  } | null;
  gatewayLastEventAgeSeconds: number | null;
  linkState: 'linked_no_gateway' | 'gateway_set' | 'connected' | 'stale';
}

interface CaneRow {
  id: string;
  serial: string;
  model: string;
  firmware_version: string | null;
  claim_secret_hash: string;
  status: string;
}

@Injectable()
export class CanesService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly clock: ClockPort,
    private readonly policy: PolicyConfig,
    @Inject(forwardRef(() => AccessService))
    private readonly access: AccessService,
  ) {}

  claim(
    principal: Principal,
    input: ClaimCaneDto,
  ): Promise<{ cane: CaneView; replay: boolean }> {
    return this.db.asOnboarding(toAccountContext(principal), async (tx) => {
      const access = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM guardme.profile_access
        WHERE account_id = ${principal.accountId}::uuid
          AND profile_id = ${input.profileId}::uuid
          AND status = 'active'
      `;
      if (!access[0]) throw new DomainError('NOT_FOUND');
      const canes = await tx.$queryRaw<CaneRow[]>`
        SELECT id, serial, model, firmware_version, claim_secret_hash, status
        FROM guardme.canes
        WHERE serial = ${input.serial}
        FOR UPDATE
      `;
      const cane = canes[0];
      if (!cane || cane.status === 'retired')
        throw new DomainError('NOT_FOUND');
      const presented = hashSecret(normalizeEnrollmentCode(input.claimCode));
      if (!sameHash(presented, cane.claim_secret_hash)) {
        await this.audit.record(tx, {
          operation: 'cane.claim',
          result: 'denied',
          actorKind: 'account',
          actorAccountId: principal.accountId,
          profileId: input.profileId,
          details: { serial: input.serial },
        });
        throw new DomainError('NOT_FOUND');
      }
      // PD-12 pendiente
      if (this.policy.caneProximityProofRequired && !input.proximityProof) {
        throw new DomainError('CAPABILITY_NOT_ENABLED');
      }
      const active = await tx.$queryRaw<
        Array<{ id: string; profile_id: string }>
      >`
        SELECT id, profile_id
        FROM guardme.cane_assignments
        WHERE cane_id = ${cane.id}::uuid
          AND ended_at IS NULL
      `;
      if (active[0]?.profile_id === input.profileId) {
        return {
          cane: await this.loadView(tx, cane.id, principal.installationId),
          replay: true,
        };
      }
      if (active[0]) {
        throw new DomainError('INCOMPATIBLE_STATE', undefined, {
          reason: 'assigned_elsewhere',
        });
      }
      await tx.$executeRaw`
        INSERT INTO guardme.cane_assignments (cane_id, profile_id, assigned_by_account_id)
        VALUES (${cane.id}::uuid, ${input.profileId}::uuid, ${principal.accountId}::uuid)
      `;
      await tx.$executeRaw`
        UPDATE guardme.canes
        SET status = 'assigned'
        WHERE id = ${cane.id}::uuid
      `;
      await this.audit.record(tx, {
        operation: 'cane.claim',
        result: 'ok',
        actorKind: 'account',
        actorAccountId: principal.accountId,
        profileId: input.profileId,
        details: { caneId: cane.id, serial: input.serial },
      });
      return {
        cane: await this.loadView(tx, cane.id, principal.installationId),
        replay: false,
      };
    });
  }

  release(principal: Principal, caneId: string): Promise<void> {
    const now = this.clock.now();
    return this.db.asOnboarding(toAccountContext(principal), async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string; profile_id: string }>
      >`
        SELECT id, profile_id
        FROM guardme.cane_assignments
        WHERE cane_id = ${caneId}::uuid
          AND ended_at IS NULL
        FOR UPDATE
      `;
      const assignment = rows[0];
      if (!assignment) throw new DomainError('NOT_FOUND');
      const access = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM guardme.profile_access
        WHERE account_id = ${principal.accountId}::uuid
          AND profile_id = ${assignment.profile_id}::uuid
          AND status = 'active'
      `;
      if (!access[0]) throw new DomainError('NOT_FOUND');
      await tx.$executeRaw`
        UPDATE guardme.gateways
        SET ended_at = ${now},
            end_reason = 'cane_released'
        WHERE cane_assignment_id = ${assignment.id}::uuid
          AND ended_at IS NULL
      `;
      await tx.$executeRaw`
        UPDATE guardme.cane_assignments
        SET ended_at = ${now},
            ended_by_account_id = ${principal.accountId}::uuid
        WHERE id = ${assignment.id}::uuid
      `;
      await tx.$executeRaw`
        UPDATE guardme.canes
        SET status = 'available'
        WHERE id = ${caneId}::uuid
      `;
      await this.audit.record(tx, {
        operation: 'cane.release',
        result: 'ok',
        actorKind: 'account',
        actorAccountId: principal.accountId,
        profileId: assignment.profile_id,
        details: { caneId },
      });
    });
  }

  listForProfile(principal: Principal, profileId: string): Promise<CaneView[]> {
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      await this.access.requireAccess(tx, profileId);
      const rows = await tx.$queryRaw<Array<{ cane_id: string }>>`
        SELECT cane_id
        FROM guardme.cane_assignments
        WHERE profile_id = ${profileId}::uuid
          AND ended_at IS NULL
        ORDER BY started_at
      `;
      const views: CaneView[] = [];
      for (const row of rows) {
        views.push(
          await this.loadView(tx, row.cane_id, principal.installationId),
        );
      }
      return views;
    });
  }

  async loadView(
    tx: Tx,
    caneId: string,
    installationId: string | null,
  ): Promise<CaneView> {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        serial: string;
        model: string;
        firmware_version: string | null;
        assignment_id: string;
        profile_id: string;
        started_at: Date;
        installation_id: string | null;
        gateway_started_at: Date | null;
        last_event_at: Date | null;
        battery_pct: number | null;
        charging: boolean | null;
        sensor_status: string | null;
        link_status: string | null;
        captured_at: Date | null;
      }>
    >`
      SELECT
        c.id,
        c.serial,
        c.model,
        c.firmware_version,
        a.id AS assignment_id,
        a.profile_id,
        a.started_at,
        g.installation_id,
        g.started_at AS gateway_started_at,
        g.last_event_at,
        t.battery_pct,
        t.charging,
        t.sensor_status,
        t.link_status,
        t.captured_at
      FROM guardme.canes c
      JOIN guardme.cane_assignments a
        ON a.cane_id = c.id
       AND a.ended_at IS NULL
      LEFT JOIN guardme.gateways g
        ON g.cane_id = c.id
       AND g.ended_at IS NULL
      LEFT JOIN guardme.cane_telemetry_latest t
        ON t.cane_assignment_id = a.id
      WHERE c.id = ${caneId}::uuid
    `;
    const row = rows[0];
    if (!row) throw new DomainError('NOT_FOUND');
    const gateway = row.installation_id
      ? {
          installationId: row.installation_id,
          isThisInstallation: row.installation_id === installationId,
          startedAt:
            row.gateway_started_at?.toISOString() ??
            row.started_at.toISOString(),
          lastEventAt: row.last_event_at?.toISOString() ?? null,
        }
      : null;
    const now = this.clock.now().getTime();
    const telemetry = row.captured_at
      ? {
          batteryPct: row.battery_pct,
          charging: row.charging,
          sensorStatus: row.sensor_status,
          linkStatus: row.link_status,
          capturedAt: row.captured_at.toISOString(),
          ageSeconds: ageSeconds(now, row.captured_at),
        }
      : null;
    const fresh = telemetry
      ? telemetry.linkStatus === 'connected' &&
        telemetry.ageSeconds <= this.policy.caneLinkFreshSec
      : false;
    return {
      id: row.id,
      serial: row.serial,
      model: row.model,
      firmwareVersion: row.firmware_version,
      assignment: {
        id: row.assignment_id,
        profileId: row.profile_id,
        startedAt: row.started_at.toISOString(),
      },
      gateway,
      telemetry,
      gatewayLastEventAgeSeconds: row.last_event_at
        ? ageSeconds(now, row.last_event_at)
        : null,
      linkState: fresh
        ? 'connected'
        : telemetry
          ? 'stale'
          : gateway
            ? 'gateway_set'
            : 'linked_no_gateway',
    };
  }
}

function ageSeconds(nowMs: number, at: Date): number {
  return Math.max(0, Math.floor((nowMs - at.getTime()) / 1000));
}

function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
