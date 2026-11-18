import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { PolicyConfig } from '../../config/policy.config';
import { ClockPort } from '../../infra/clock/clock.port';
import { DbService, type Tx } from '../../infra/db/db.service';
import {
  CallPlanService,
  type CallAttemptView,
} from '../calling/call-plan.service';
import { GatewayResolverService } from '../devices/gateway-resolver.service';
import {
  FollowupsService,
  type FollowupDetail,
} from '../followups/followups.service';
import { toAccountContext, type Principal } from '../identity/principal';
import { LocationService } from '../location/location.service';
import {
  NotificationsService,
  type RecipientEvidenceView,
} from '../notifications/notifications.service';
import { PendingActionsService } from '../pending-actions/pending-actions.service';
import { AccessService } from '../profiles/access.service';
import { DecisionsService, type DecisionView } from './decisions.service';
import type { ActivateIncidentDto } from './dto/activate-incident.dto';
import { IncidentEventsService } from './incident-events.service';

export interface IncidentView {
  id: string;
  profileId: string;
  origin: string;
  status: string;
  escalationReason: string | null;
  occurredAt: string;
  receivedAt: string;
  isDelayed: boolean;
  version: number;
  registration: 'persisted';
  notification: 'scheduled' | 'not_scheduled';
}

export interface IncidentEventView {
  id: string;
  type: string;
  actorKind: string;
  at: string;
  context: Record<string, unknown>;
}

export interface IncidentDetailView extends IncidentView {
  events: IncidentEventView[];
  notifications: RecipientEvidenceView[];
  calls: CallAttemptView[];
  decisions: DecisionView[];
  followup: FollowupDetail | null;
  capabilities: { emergencyAutoCall: 'not_enabled' };
}

interface IncidentRow {
  id: string;
  profile_id: string;
  origin: string;
  status: string;
  escalation_reason: string | null;
  occurred_at: Date;
  received_at: Date;
  is_delayed: boolean;
  version: number;
}

@Injectable()
export class IncidentsService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockPort,
    private readonly policy: PolicyConfig,
    private readonly events: IncidentEventsService,
    private readonly pending: PendingActionsService,
    private readonly access: AccessService,
    @Inject(forwardRef(() => GatewayResolverService))
    private readonly gateways: GatewayResolverService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notifications: NotificationsService,
    @Inject(forwardRef(() => CallPlanService))
    private readonly plans: CallPlanService,
    @Inject(forwardRef(() => DecisionsService))
    private readonly decisions: DecisionsService,
    @Inject(forwardRef(() => FollowupsService))
    private readonly followups: FollowupsService,
    @Inject(forwardRef(() => LocationService))
    private readonly location: LocationService,
  ) {}

  activate(
    principal: Principal,
    input: ActivateIncidentDto,
  ): Promise<{ incident: IncidentView; replay: boolean }> {
    const installationId = requiredInstallation(principal);
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const sourceKey = this.sourceKey(input);
      const existing = await this.findByKey(tx, sourceKey);
      if (existing) return { incident: toView(existing), replay: true };
      const resolved = await this.resolve(tx, input, installationId);
      const receivedAt = this.clock.now();
      const occurredAt = estimateOccurredAt(receivedAt, input);
      const isDelayed =
        receivedAt.getTime() - occurredAt.getTime() >
        this.policy.maxIncidentAgeForCallsSec * 1000;
      const status =
        input.origin === 'manual_emergency'
          ? 'escalation_required'
          : isDelayed
            ? 'delayed_review'
            : 'pending_contact';
      const escalationReason =
        input.origin === 'manual_emergency' ? 'manual_request' : null;
      let inserted: IncidentRow[];
      try {
        inserted = await tx.$queryRaw<IncidentRow[]>`
          INSERT INTO guardme.incidents (
            profile_id, cane_id, cane_assignment_id, origin, source_key, status,
            escalation_reason, occurred_at, reported_occurred_at, received_at,
            is_delayed, created_by_installation_id, context
          )
          VALUES (
            ${resolved.profileId}::uuid,
            ${resolved.caneId}::uuid,
            ${resolved.caneAssignmentId}::uuid,
            ${input.origin},
            ${sourceKey},
            ${status},
            ${escalationReason},
            ${occurredAt}::timestamptz,
            ${new Date(input.reportedOccurredAt)}::timestamptz,
            ${receivedAt}::timestamptz,
            ${isDelayed},
            ${installationId}::uuid,
            ${JSON.stringify(contextOf(input))}::jsonb
          )
          ON CONFLICT (source_key) DO NOTHING
          RETURNING
            id, profile_id, origin, status, escalation_reason,
            occurred_at, received_at, is_delayed, version
        `;
      } catch (error) {
        if (!isUniqueConflict(error)) throw error;
        inserted = [];
      }
      const row = inserted[0] ?? (await this.findByKey(tx, sourceKey));
      if (!row) throw new DomainError('NOT_FOUND');
      if (!inserted[0]) return { incident: toView(row), replay: true };
      await this.events.append(tx, {
        incidentId: row.id,
        type: isDelayed ? 'delayed_registered' : 'activated',
        actorKind: 'installation',
        actorAccountId: principal.accountId,
        actorInstallationId: installationId,
        context: { origin: input.origin, sourceEventId: input.sourceEventId },
      });
      await this.pending.enqueue(tx, {
        type: 'NOTIFY_INCIDENT',
        resourceType: 'incident',
        resourceId: row.id,
        dedupeKey: `notify:incident:${row.id}:activated`,
        runAt: receivedAt,
        payload: isDelayed ? { delayed: true } : {},
      });
      await this.events.append(tx, {
        incidentId: row.id,
        type: 'notification_scheduled',
        actorKind: 'system',
        actorAccountId: null,
        actorInstallationId: null,
        context: { delayed: isDelayed },
      });
      if (row.status === 'pending_contact') {
        await this.plans.createForIncident(tx, row);
      }
      if (input.location) {
        await this.location.publishInTx(
          tx,
          principal,
          resolved.profileId,
          input.location,
        );
      }
      return { incident: toView(row), replay: false };
    });
  }

  listForProfile(
    principal: Principal,
    profileId: string,
    query: { cursor?: string; limit?: number },
  ): Promise<{ items: IncidentView[]; nextCursor: string | null }> {
    const limit = query.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new DomainError('VALIDATION_FAILED', 'Validación fallida', {
        fields: [{ field: 'limit', messages: ['Entre 1 y 50'] }],
      });
    }
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      await this.access.requireAccess(tx, profileId);
      const rows = await tx.$queryRaw<IncidentRow[]>`
        SELECT
          id, profile_id, origin, status, escalation_reason,
          occurred_at, received_at, is_delayed, version
        FROM guardme.incidents
        WHERE profile_id = ${profileId}::uuid
          AND (
            ${cursor?.at ?? null}::timestamptz IS NULL
            OR occurred_at < ${cursor?.at ?? null}::timestamptz
            OR (
              occurred_at = ${cursor?.at ?? null}::timestamptz
              AND id < ${cursor?.id ?? null}::uuid
            )
          )
        ORDER BY occurred_at DESC, id DESC
        LIMIT ${limit + 1}::int
      `;
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const nextCursor =
        rows.length > limit && last
          ? encodeCursor({
              at: last.occurred_at.toISOString(),
              id: last.id,
            })
          : null;
      return { items: page.map((row) => toView(row)), nextCursor };
    });
  }

  getDetail(
    principal: Principal,
    incidentId: string,
  ): Promise<IncidentDetailView> {
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const rows = await tx.$queryRaw<IncidentRow[]>`
        SELECT
          id, profile_id, origin, status, escalation_reason,
          occurred_at, received_at, is_delayed, version
        FROM guardme.incidents
        WHERE id = ${incidentId}::uuid
      `;
      const row = rows[0];
      if (!row) throw new DomainError('NOT_FOUND');
      const events = await tx.$queryRaw<
        Array<{
          id: string;
          type: string;
          actor_kind: string;
          at: Date;
          context: Record<string, unknown>;
        }>
      >`
        SELECT id, type, actor_kind, at, context
        FROM guardme.incident_events
        WHERE incident_id = ${incidentId}::uuid
        ORDER BY at, id
      `;
      return {
        ...toView(row),
        events: events.map((event) => ({
          id: event.id,
          type: event.type,
          actorKind: event.actor_kind,
          at: event.at.toISOString(),
          context: event.context ?? {},
        })),
        notifications: await this.notifications.evidenceForResource(
          tx,
          'incident',
          incidentId,
        ),
        calls: await this.plans.listForIncident(tx, incidentId),
        decisions: await this.decisions.listForIncident(tx, incidentId),
        followup: await this.followups.forIncident(tx, incidentId),
        capabilities: { emergencyAutoCall: 'not_enabled' },
      };
    });
  }

  listCalls(
    principal: Principal,
    incidentId: string,
  ): Promise<CallAttemptView[]> {
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM guardme.incidents WHERE id = ${incidentId}::uuid
      `;
      if (!rows[0]) throw new DomainError('NOT_FOUND');
      return this.plans.listForIncident(tx, incidentId);
    });
  }

  private async resolve(
    tx: Tx,
    input: ActivateIncidentDto,
    installationId: string,
  ): Promise<{
    profileId: string;
    caneId: string | null;
    caneAssignmentId: string | null;
  }> {
    if (input.origin === 'fall_detected') {
      if (!input.caneId) {
        throw new DomainError('VALIDATION_FAILED', 'Validación fallida', {
          fields: [{ field: 'caneId', messages: ['Obligatorio'] }],
        });
      }
      const gateway = await this.gateways.resolveActive(
        tx,
        installationId,
        input.caneId,
      );
      return {
        profileId: gateway.profileId,
        caneId: gateway.caneId,
        caneAssignmentId: gateway.caneAssignmentId,
      };
    }
    if (!input.profileId) {
      throw new DomainError('VALIDATION_FAILED', 'Validación fallida', {
        fields: [{ field: 'profileId', messages: ['Obligatorio'] }],
      });
    }
    const access = await this.access.requireAccess(tx, input.profileId);
    if (access.relation !== 'user') {
      throw new DomainError('FORBIDDEN_ACTION');
    }
    return {
      profileId: input.profileId,
      caneId: null,
      caneAssignmentId: null,
    };
  }

  private sourceKey(input: ActivateIncidentDto): string {
    if (input.origin === 'fall_detected') {
      return `fall:${input.caneId}:${input.sourceEventId}`;
    }
    return `manual:${input.profileId}:${input.sourceEventId}`;
  }

  private async findByKey(
    tx: Tx,
    sourceKey: string,
  ): Promise<IncidentRow | undefined> {
    const rows = await tx.$queryRaw<IncidentRow[]>`
      SELECT
        id, profile_id, origin, status, escalation_reason,
        occurred_at, received_at, is_delayed, version
      FROM guardme.incidents
      WHERE source_key = ${sourceKey}
    `;
    return rows[0];
  }
}

export function fallSourceKey(caneId: string, sourceEventId: string): string {
  return `fall:${caneId}:${sourceEventId}`;
}

function estimateOccurredAt(
  receivedAt: Date,
  input: ActivateIncidentDto,
): Date {
  if (input.ageAtSendMs != null) {
    return new Date(receivedAt.getTime() - input.ageAtSendMs);
  }
  const reported = new Date(input.reportedOccurredAt);
  return reported.getTime() > receivedAt.getTime() ? receivedAt : reported;
}

function contextOf(input: ActivateIncidentDto): Record<string, unknown> {
  return {
    protocolVersion: input.protocolVersion,
    bootId: input.bootId ?? null,
    sequence: input.sequence ?? null,
    windowStartedAt: input.windowStartedAt ?? null,
    windowEndedAt: input.windowEndedAt ?? null,
    connectivity: input.connectivity ?? null,
  };
}

function toView(row: IncidentRow): IncidentView {
  return {
    id: row.id,
    profileId: row.profile_id,
    origin: row.origin,
    status: row.status,
    escalationReason: row.escalation_reason,
    occurredAt: row.occurred_at.toISOString(),
    receivedAt: row.received_at.toISOString(),
    isDelayed: row.is_delayed,
    version: row.version,
    registration: 'persisted',
    notification: 'scheduled',
  };
}

function requiredInstallation(principal: Principal): string {
  if (!principal.installationId) {
    throw new DomainError('INSTALLATION_MISMATCH');
  }
  return principal.installationId;
}

function isUniqueConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as {
    code?: unknown;
    message?: unknown;
    meta?: { code?: unknown };
  };
  const codes = [record.code, record.meta?.code].map((value) => String(value));
  return (
    codes.includes('23505') ||
    codes.includes('P2002') ||
    (typeof record.message === 'string' && record.message.includes('23505'))
  );
}
