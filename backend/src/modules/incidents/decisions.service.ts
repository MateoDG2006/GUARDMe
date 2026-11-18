import { randomUUID } from 'crypto';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { PolicyConfig } from '../../config/policy.config';
import { ClockPort } from '../../infra/clock/clock.port';
import { DbService, type Tx } from '../../infra/db/db.service';
import { CallPlanService } from '../calling/call-plan.service';
import { FollowupsService } from '../followups/followups.service';
import { toAccountContext, type Principal } from '../identity/principal';
import { PendingActionsService } from '../pending-actions/pending-actions.service';
import { AccessService } from '../profiles/access.service';
import type {
  DecideDto,
  DecisionOption,
  EmergencyActionDto,
} from './dto/decision.dto';
import { IncidentEventsService } from './incident-events.service';
import { assertTransition, type IncidentStatus } from './incident-state';
import type { IncidentView } from './incidents.service';

export interface DecisionResult {
  incident: IncidentView;
  decision: {
    id: string;
    option: DecisionOption;
    at: string;
    byAccountId: string;
  };
  replay: boolean;
  emergency?: { autoCall: 'not_enabled'; recommendedAction: 'open_dialer' };
}

export interface DecisionView {
  option: DecisionOption;
  at: string;
  byAccountId: string;
  byDisplayName: string;
}

interface IncidentLock {
  id: string;
  profile_id: string;
  origin: string;
  status: IncidentStatus;
  escalation_reason: string | null;
  occurred_at: Date;
  received_at: Date;
  is_delayed: boolean;
  version: number;
  closed_by_account_id: string | null;
}

@Injectable()
export class DecisionsService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockPort,
    private readonly policy: PolicyConfig,
    private readonly events: IncidentEventsService,
    private readonly pending: PendingActionsService,
    private readonly plans: CallPlanService,
    private readonly access: AccessService,
    @Inject(forwardRef(() => FollowupsService))
    private readonly followups: FollowupsService,
  ) {}

  decide(
    principal: Principal,
    incidentId: string,
    input: DecideDto,
  ): Promise<DecisionResult> {
    if (!principal.accountId) throw new DomainError('ACCOUNT_NOT_BOOTSTRAPPED');
    const accountId = principal.accountId;
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const incident = await this.lock(tx, incidentId);
      const access = await this.access.requireAccess(tx, incident.profile_id);
      if (access.relation !== 'caregiver') {
        throw new DomainError('FORBIDDEN_ACTION');
      }
      const prior = await this.findDecision(
        tx,
        incidentId,
        accountId,
        input.option,
      );
      if (prior && prior.resulting_status === incident.status) {
        return {
          incident: toView(incident),
          decision: toDecision(prior, accountId),
          replay: true,
        };
      }
      if (input.expectedVersion !== incident.version) {
        const details = { current: currentOf(incident) };
        if (incident.status === 'closed_assisted') {
          throw new DomainError('INCOMPATIBLE_STATE', undefined, details);
        }
        throw new DomainError('VERSION_CONFLICT', undefined, details);
      }
      if (
        incident.status === 'pending_contact' ||
        incident.status === 'contacting'
      ) {
        await this.events.append(tx, {
          incidentId,
          type: 'caregiver_informed',
          actorKind: 'account',
          actorAccountId: accountId,
          actorInstallationId: principal.installationId,
          context: { option: input.option },
        });
        await tx.$executeRaw`
          UPDATE guardme.call_attempts
          SET status = 'human_confirmed'
          WHERE incident_id = ${incidentId}::uuid
            AND linked_account_id = ${accountId}::uuid
            AND status IN ('requesting', 'ringing', 'answered_transport', 'uncertain')
        `;
      }
      const now = this.clock.now();
      const next = nextStatus(input.option);
      assertTransition(incident.status, next.status);
      if (next.status === 'closed_assisted') {
        await tx.$executeRaw`
          UPDATE guardme.incidents
          SET status = 'closed_assisted',
              closed_at = ${now}::timestamptz,
              closed_by_account_id = ${accountId}::uuid
          WHERE id = ${incidentId}::uuid
        `;
      } else if (next.status === 'escalation_required') {
        await tx.$executeRaw`
          UPDATE guardme.incidents
          SET status = 'escalation_required', escalation_reason = 'caregiver_request'
          WHERE id = ${incidentId}::uuid
        `;
      } else {
        await tx.$executeRaw`
          UPDATE guardme.incidents
          SET status = 'attention_postponed'
          WHERE id = ${incidentId}::uuid
        `;
      }
      const stopped = await this.plans.stopPlan(
        tx,
        incidentId,
        'caregiver_decision',
      );
      if (stopped.activeAttemptId) {
        await this.pending.enqueue(tx, {
          type: 'CANCEL_ACTIVE_CALL',
          resourceType: 'call_attempt',
          resourceId: stopped.activeAttemptId,
          dedupeKey: `call:${stopped.activeAttemptId}:cancel`,
          runAt: now,
        });
      }
      const decisionId = randomUUID();
      await this.effects(
        tx,
        incident,
        input.option,
        accountId,
        now,
        decisionId,
      );
      let inserted: Array<{ id: string; at: Date }>;
      try {
        inserted = await tx.$queryRaw`
          INSERT INTO guardme.caregiver_decisions (
            id, incident_id, account_id, option, at, applied_incident_version, resulting_status
          )
          VALUES (
            ${decisionId}::uuid,
            ${incidentId}::uuid,
            ${accountId}::uuid,
            ${input.option},
            ${now}::timestamptz,
            ${incident.version}::int,
            ${next.status}
          )
          RETURNING id, at
        `;
      } catch (error) {
        if (!isUniqueConflict(error)) throw error;
        return this.lostRace(tx, incidentId, accountId);
      }
      const row = inserted[0];
      if (!row) return this.lostRace(tx, incidentId, accountId);
      const updated = await this.lock(tx, incidentId);
      const result: DecisionResult = {
        incident: toView(updated),
        decision: {
          id: row.id,
          option: input.option,
          at: row.at.toISOString(),
          byAccountId: accountId,
        },
        replay: false,
      };
      if (input.option === 'request_emergency') {
        result.emergency = {
          autoCall: 'not_enabled',
          recommendedAction: 'open_dialer',
        };
      }
      return result;
    });
  }

  async recordEmergencyAction(
    principal: Principal,
    incidentId: string,
    input: EmergencyActionDto,
  ): Promise<void> {
    await this.db.asAccount(toAccountContext(principal), async (tx) => {
      const incident = await this.lock(tx, incidentId);
      await this.access.requireAccess(tx, incident.profile_id);
      await this.events.append(tx, {
        incidentId,
        type: 'emergency_dialer_opened',
        actorKind: 'account',
        actorAccountId: principal.accountId,
        actorInstallationId: principal.installationId,
        context: { kind: input.kind },
      });
    });
  }

  async listForIncident(tx: Tx, incidentId: string): Promise<DecisionView[]> {
    const rows = await tx.$queryRaw<
      Array<{
        option: DecisionOption;
        at: Date;
        account_id: string;
        display_name: string | null;
      }>
    >`
      SELECT d.option, d.at, d.account_id, a.display_name
      FROM guardme.caregiver_decisions d
      LEFT JOIN guardme.accounts a ON a.id = d.account_id
      WHERE d.incident_id = ${incidentId}::uuid
      ORDER BY d.at, d.id
    `;
    return rows.map((row) => ({
      option: row.option,
      at: row.at.toISOString(),
      byAccountId: row.account_id,
      byDisplayName: row.display_name ?? '',
    }));
  }

  private async effects(
    tx: Tx,
    incident: IncidentLock,
    option: DecisionOption,
    accountId: string,
    now: Date,
    decisionId: string,
  ): Promise<void> {
    if (option === 'take_charge') {
      await this.events.append(tx, {
        incidentId: incident.id,
        type: 'decision_take_charge',
        actorKind: 'account',
        actorAccountId: accountId,
        actorInstallationId: null,
        context: {},
      });
      await this.events.append(tx, {
        incidentId: incident.id,
        type: 'closed_assisted',
        actorKind: 'account',
        actorAccountId: accountId,
        actorInstallationId: null,
        context: {},
      });
      await this.followups.createForIncident(tx, incident);
    } else if (option === 'postpone') {
      await this.events.append(tx, {
        incidentId: incident.id,
        type: 'decision_postpone',
        actorKind: 'account',
        actorAccountId: accountId,
        actorInstallationId: null,
        context: {},
      });
    } else {
      await this.events.append(tx, {
        incidentId: incident.id,
        type: 'decision_request_emergency',
        actorKind: 'account',
        actorAccountId: accountId,
        actorInstallationId: null,
        context: {},
      });
      await this.events.append(tx, {
        incidentId: incident.id,
        type: 'escalation_required',
        actorKind: 'account',
        actorAccountId: accountId,
        actorInstallationId: null,
        context: { reason: 'caregiver_request' },
      });
    }
    await this.pending.enqueue(tx, {
      type: 'NOTIFY_INCIDENT_UPDATE',
      resourceType: 'incident',
      resourceId: incident.id,
      dedupeKey: `notify:incident:${incident.id}:${option}:${incident.version}`,
      runAt: now,
    });
    if (option !== 'postpone') return;
    await this.pending.enqueue(tx, {
      type: 'POSTPONE_REMINDER',
      resourceType: 'incident',
      resourceId: incident.id,
      dedupeKey: `postpone:${incident.id}:${incident.version}:reminder`,
      runAt: new Date(now.getTime() + this.policy.postponeReminderSec * 1000),
      payload: { decisionId, accountId },
    });
    await this.pending.enqueue(tx, {
      type: 'POSTPONE_COLLECTIVE',
      resourceType: 'incident',
      resourceId: incident.id,
      dedupeKey: `postpone:${incident.id}:${incident.version}:collective`,
      runAt: new Date(now.getTime() + this.policy.postponeCollectiveSec * 1000),
      payload: { decisionId, accountId },
    });
  }

  private async lostRace(
    tx: Tx,
    incidentId: string,
    accountId: string,
  ): Promise<DecisionResult> {
    const incident = await this.lock(tx, incidentId);
    const existing = await tx.$queryRaw<
      Array<{
        id: string;
        account_id: string;
        option: DecisionOption;
        at: Date;
        resulting_status: string;
      }>
    >`
      SELECT id, account_id, option, at, resulting_status
      FROM guardme.caregiver_decisions
      WHERE incident_id = ${incidentId}::uuid
        AND option = 'take_charge'
    `;
    const row = existing[0];
    if (
      row &&
      row.account_id === accountId &&
      row.resulting_status === incident.status
    ) {
      return {
        incident: toView(incident),
        decision: toDecision(row, accountId),
        replay: true,
      };
    }
    throw new DomainError('INCOMPATIBLE_STATE', undefined, {
      current: currentOf(incident),
    });
  }

  private async lock(tx: Tx, incidentId: string): Promise<IncidentLock> {
    const rows = await tx.$queryRaw<IncidentLock[]>`
      SELECT
        id, profile_id, origin, status, escalation_reason, occurred_at, received_at,
        is_delayed, version, closed_by_account_id
      FROM guardme.incidents
      WHERE id = ${incidentId}::uuid
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) throw new DomainError('NOT_FOUND');
    return row;
  }

  private async findDecision(
    tx: Tx,
    incidentId: string,
    accountId: string,
    option: DecisionOption,
  ) {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        option: DecisionOption;
        at: Date;
        resulting_status: string;
      }>
    >`
      SELECT id, option, at, resulting_status
      FROM guardme.caregiver_decisions
      WHERE incident_id = ${incidentId}::uuid
        AND account_id = ${accountId}::uuid
        AND option = ${option}
      ORDER BY at DESC
      LIMIT 1
    `;
    return rows[0];
  }
}

function nextStatus(option: DecisionOption): {
  status: IncidentStatus;
  reason: string | null;
} {
  if (option === 'take_charge')
    return { status: 'closed_assisted', reason: null };
  if (option === 'postpone')
    return { status: 'attention_postponed', reason: null };
  return { status: 'escalation_required', reason: 'caregiver_request' };
}

function toView(row: IncidentLock): IncidentView {
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

function toDecision(
  row: { id: string; option: DecisionOption; at: Date },
  accountId: string,
): DecisionResult['decision'] {
  return {
    id: row.id,
    option: row.option,
    at: row.at.toISOString(),
    byAccountId: accountId,
  };
}

function currentOf(row: IncidentLock): Record<string, unknown> {
  return {
    status: row.status,
    version: row.version,
    escalationReason: row.escalation_reason,
    closedByAccountId: row.closed_by_account_id,
  };
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
