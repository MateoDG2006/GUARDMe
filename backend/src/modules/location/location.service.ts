import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError } from '../../common/errors/domain-error';
import { ClockPort } from '../../infra/clock/clock.port';
import { DbService, type Tx } from '../../infra/db/db.service';
import { AuditService } from '../audit/audit.service';
import { toAccountContext, type Principal } from '../identity/principal';
import { AccessService } from '../profiles/access.service';
import { SyncSignalService } from '../sync/sync-signal.service';
import type {
  LocationConsentDto,
  PublishLocationDto,
} from './dto/location.dto';

export interface LocationConsentView {
  enabled: boolean;
  grantedBy: string | null;
  grantedAt: string | null;
  readers: Array<{ accountId: string; displayName: string }>;
  version: number;
}

export interface LocationView {
  available: true;
  lat: number;
  lng: number;
  accuracyM: number;
  capturedAt: string;
  receivedAt: string;
  ageSeconds: number;
  source: 'phone';
}

export type LocationUnavailable = {
  available: false;
  reason: 'no_data' | 'not_enabled';
};

@Injectable()
export class LocationService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockPort,
    private readonly config: ConfigService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly sync: SyncSignalService,
  ) {}

  setConsent(
    principal: Principal,
    profileId: string,
    input: LocationConsentDto,
  ): Promise<LocationConsentView> {
    this.assertEnabled();
    const accountId = principal.accountId;
    if (!accountId) throw new DomainError('ACCOUNT_NOT_BOOTSTRAPPED');
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      await this.access.requireAccess(tx, profileId);
      const current = await this.activeConsent(tx, profileId);
      if (
        input.expectedVersion != null &&
        input.expectedVersion !== (current?.version ?? 0)
      ) {
        throw new DomainError('VERSION_CONFLICT', undefined, {
          current: { version: current?.version ?? 0 },
        });
      }
      if (!input.enabled) {
        if (current) {
          await tx.$executeRaw`
            UPDATE guardme.location_read_grants
            SET revoked_at = ${this.clock.now()}::timestamptz
            WHERE consent_id = ${current.id}::uuid
              AND revoked_at IS NULL
          `;
          await tx.$executeRaw`
            UPDATE guardme.location_consents
            SET revoked_at = ${this.clock.now()}::timestamptz,
                revoked_by_account_id = ${accountId}::uuid
            WHERE id = ${current.id}::uuid
          `;
        }
        await tx.$executeRaw`
          DELETE FROM guardme.location_latest WHERE profile_id = ${profileId}::uuid
        `;
      } else {
        await this.replaceReaders(
          tx,
          profileId,
          accountId,
          current,
          input.readers,
        );
      }
      await this.audit.record(tx, {
        operation: 'location.consent',
        result: 'ok',
        profileId,
        actorAccountId: accountId,
        actorKind: 'account',
        details: { enabled: input.enabled },
      });
      await this.sync.requestSyncSignal(tx, profileId, 'changes');
      return this.consentView(tx, profileId);
    });
  }

  getConsent(
    principal: Principal,
    profileId: string,
  ): Promise<LocationConsentView> {
    this.assertEnabled();
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      await this.access.requireAccess(tx, profileId);
      return this.consentView(tx, profileId);
    });
  }

  async publish(
    principal: Principal,
    profileId: string,
    input: PublishLocationDto,
  ): Promise<{ applied: boolean }> {
    this.assertEnabled();
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const result = await this.publishInTx(tx, principal, profileId, input);
      if (result.reason === 'no_consent') {
        throw new DomainError('FORBIDDEN_ACTION', undefined, {
          reason: 'no_consent',
        });
      }
      if (result.reason === 'not_user') {
        throw new DomainError('FORBIDDEN_ACTION');
      }
      if (result.reason === 'future') {
        throw new DomainError('VALIDATION_FAILED', 'Validación fallida', {
          fields: [{ field: 'capturedAt', messages: ['Está en el futuro'] }],
        });
      }
      return { applied: result.applied };
    });
  }

  async publishInTx(
    tx: Tx,
    principal: Principal,
    profileId: string,
    input: PublishLocationDto,
  ): Promise<{
    applied: boolean;
    reason?: 'no_consent' | 'not_user' | 'future' | 'stale';
  }> {
    if (!this.enabled()) return { applied: false, reason: 'no_consent' };
    const access = await this.access.requireAccess(tx, profileId);
    if (access.relation !== 'user')
      return { applied: false, reason: 'not_user' };
    const consent = await this.activeConsent(tx, profileId);
    if (!consent) return { applied: false, reason: 'no_consent' };
    const capturedAt = new Date(input.capturedAt);
    if (capturedAt.getTime() > this.clock.now().getTime() + 60_000) {
      return { applied: false, reason: 'future' };
    }
    const existing = await tx.$queryRaw<Array<{ captured_at: Date }>>`
      SELECT captured_at FROM guardme.location_latest WHERE profile_id = ${profileId}::uuid
    `;
    if (
      existing[0] &&
      existing[0].captured_at.getTime() >= capturedAt.getTime()
    ) {
      return { applied: false, reason: 'stale' };
    }
    const receivedAt = this.clock.now();
    await tx.$executeRaw`
      INSERT INTO guardme.location_latest (
        profile_id, lat, lng, accuracy_m, captured_at, received_at, installation_id
      )
      VALUES (
        ${profileId}::uuid,
        ${input.lat},
        ${input.lng},
        ${input.accuracyM},
        ${capturedAt}::timestamptz,
        ${receivedAt}::timestamptz,
        ${principal.installationId}::uuid
      )
      ON CONFLICT (profile_id) DO UPDATE
      SET lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          accuracy_m = EXCLUDED.accuracy_m,
          captured_at = EXCLUDED.captured_at,
          received_at = EXCLUDED.received_at,
          installation_id = EXCLUDED.installation_id
    `;
    return { applied: true };
  }

  getLatest(
    principal: Principal,
    profileId: string,
  ): Promise<LocationView | LocationUnavailable> {
    if (!this.enabled())
      return Promise.resolve({ available: false, reason: 'not_enabled' });
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const access = await this.access.requireAccess(tx, profileId);
      if (access.relation === 'caregiver') {
        const allowed = await tx.$queryRaw<Array<{ ok: boolean }>>`
          SELECT guardme.can_read_location(${profileId}::uuid) AS ok
        `;
        if (!allowed[0]?.ok) {
          throw new DomainError('FORBIDDEN_ACTION', undefined, {
            reason: 'no_consent',
          });
        }
      }
      const rows = await tx.$queryRaw<
        Array<{
          lat: number;
          lng: number;
          accuracy_m: number;
          captured_at: Date;
          received_at: Date;
        }>
      >`
        SELECT lat, lng, accuracy_m, captured_at, received_at
        FROM guardme.location_latest
        WHERE profile_id = ${profileId}::uuid
      `;
      const row = rows[0];
      if (!row) return { available: false, reason: 'no_data' };
      return {
        available: true,
        lat: row.lat,
        lng: row.lng,
        accuracyM: row.accuracy_m,
        capturedAt: row.captured_at.toISOString(),
        receivedAt: row.received_at.toISOString(),
        ageSeconds: Math.max(
          0,
          Math.floor(
            (this.clock.now().getTime() - row.captured_at.getTime()) / 1000,
          ),
        ),
        source: 'phone',
      };
    });
  }

  requestRefresh(
    principal: Principal,
    profileId: string,
  ): Promise<{ status: 'requested' }> {
    this.assertEnabled();
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const access = await this.access.requireAccess(tx, profileId);
      if (access.relation !== 'caregiver') {
        throw new DomainError('FORBIDDEN_ACTION');
      }
      const allowed = await tx.$queryRaw<Array<{ ok: boolean }>>`
        SELECT guardme.can_read_location(${profileId}::uuid) AS ok
      `;
      if (!allowed[0]?.ok) {
        throw new DomainError('FORBIDDEN_ACTION', undefined, {
          reason: 'no_consent',
        });
      }
      await this.sync.requestSyncSignal(tx, profileId, 'location_refresh');
      return { status: 'requested' };
    });
  }

  private async replaceReaders(
    tx: Tx,
    profileId: string,
    accountId: string,
    current: { id: string } | undefined,
    readers: string[],
  ): Promise<void> {
    if (readers.length > 0) {
      const allowed = await tx.$queryRaw<Array<{ account_id: string }>>`
        SELECT account_id
        FROM guardme.profile_access
        WHERE profile_id = ${profileId}::uuid
          AND relation = 'caregiver'
          AND status = 'active'
      `;
      const allowedIds = new Set(allowed.map((row) => row.account_id));
      if (readers.some((reader) => !allowedIds.has(reader))) {
        throw new DomainError('VALIDATION_FAILED', 'Validación fallida', {
          fields: [
            { field: 'readers', messages: ['Debe ser un cuidador activo'] },
          ],
        });
      }
    }
    let consentId = current?.id;
    if (!consentId) {
      const inserted = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO guardme.location_consents (profile_id, granted_by_account_id)
        VALUES (${profileId}::uuid, ${accountId}::uuid)
        RETURNING id
      `;
      consentId = inserted[0]?.id;
    }
    if (!consentId) throw new DomainError('NOT_FOUND');
    await tx.$executeRaw`
      UPDATE guardme.location_read_grants
      SET revoked_at = ${this.clock.now()}::timestamptz
      WHERE consent_id = ${consentId}::uuid
        AND revoked_at IS NULL
    `;
    for (const reader of readers) {
      await tx.$executeRaw`
        INSERT INTO guardme.location_read_grants (consent_id, account_id)
        VALUES (${consentId}::uuid, ${reader}::uuid)
      `;
    }
  }

  private async consentView(
    tx: Tx,
    profileId: string,
  ): Promise<LocationConsentView> {
    const consent = await this.activeConsent(tx, profileId);
    if (!consent) {
      return {
        enabled: false,
        grantedBy: null,
        grantedAt: null,
        readers: [],
        version: 0,
      };
    }
    const readers = await tx.$queryRaw<
      Array<{ account_id: string; display_name: string | null }>
    >`
      SELECT g.account_id, a.display_name
      FROM guardme.location_read_grants g
      LEFT JOIN guardme.accounts a ON a.id = g.account_id
      WHERE g.consent_id = ${consent.id}::uuid
        AND g.revoked_at IS NULL
      ORDER BY g.granted_at, g.account_id
    `;
    return {
      enabled: true,
      grantedBy: consent.granted_by_account_id,
      grantedAt: consent.granted_at.toISOString(),
      readers: readers.map((reader) => ({
        accountId: reader.account_id,
        displayName: reader.display_name ?? '',
      })),
      version: consent.version,
    };
  }

  private async activeConsent(
    tx: Tx,
    profileId: string,
  ): Promise<
    | {
        id: string;
        version: number;
        granted_by_account_id: string;
        granted_at: Date;
      }
    | undefined
  > {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        version: number;
        granted_by_account_id: string;
        granted_at: Date;
      }>
    >`
      SELECT id, version, granted_by_account_id, granted_at
      FROM guardme.location_consents
      WHERE profile_id = ${profileId}::uuid
        AND revoked_at IS NULL
    `;
    return rows[0];
  }

  private enabled(): boolean {
    return this.config.getOrThrow<boolean>('LOCATION_ENABLED');
  }

  private assertEnabled(): void {
    if (!this.enabled()) {
      throw new DomainError('CAPABILITY_NOT_ENABLED', undefined, {
        policy: 'LOCATION',
      });
    }
  }
}
