import { Injectable } from '@nestjs/common';
import { PolicyConfig } from '../../config/policy.config';
import { ClockPort } from '../../infra/clock/clock.port';
import type { Tx } from '../../infra/db/db.service';
import type { ProviderCallStatus } from '../../infra/telephony/telephony.port';
import { IncidentEventsService } from '../incidents/incident-events.service';
import {
  assertTransition,
  type IncidentStatus,
} from '../incidents/incident-state';
import { PendingActionsService } from '../pending-actions/pending-actions.service';
import {
  isTerminalAttempt,
  providerRank,
  toAttemptStatus,
  type AttemptStatus,
} from './attempt-status';
import { CallPlanService } from './call-plan.service';

export type ApplyResult =
  'applied' | 'ignored_older' | 'ignored_closed' | 'unmatched';

interface AttemptRow {
  id: string;
  call_plan_id: string;
  incident_id: string;
  ordinal: number;
  status: AttemptStatus;
  last_provider_rank: number;
  answered_at: Date | null;
}

@Injectable()
export class ProviderEventApplierService {
  constructor(
    private readonly clock: ClockPort,
    private readonly policy: PolicyConfig,
    private readonly events: IncidentEventsService,
    private readonly pending: PendingActionsService,
    private readonly plans: CallPlanService,
  ) {}

  async apply(
    tx: Tx,
    event: { id: string; providerRef: string; status: ProviderCallStatus },
  ): Promise<ApplyResult> {
    const found = await tx.$queryRaw<AttemptRow[]>`
      SELECT
        id, call_plan_id, incident_id, ordinal, status, last_provider_rank, answered_at
      FROM guardme.call_attempts
      WHERE provider_ref = ${event.providerRef}
    `;
    const match = found[0];
    if (!match) return this.finish(tx, event.id, 'unmatched');
    const incidents = await tx.$queryRaw<
      Array<{
        id: string;
        status: IncidentStatus;
        profile_id: string;
        version: number;
      }>
    >`
      SELECT id, status, profile_id, version
      FROM guardme.incidents
      WHERE id = ${match.incident_id}::uuid
      FOR UPDATE
    `;
    const incident = incidents[0];
    if (!incident) return this.finish(tx, event.id, 'unmatched');
    const lockedRows = await tx.$queryRaw<AttemptRow[]>`
      SELECT
        id, call_plan_id, incident_id, ordinal, status, last_provider_rank, answered_at
      FROM guardme.call_attempts
      WHERE id = ${match.id}::uuid
      FOR UPDATE
    `;
    const attempt = lockedRows[0];
    if (!attempt) return this.finish(tx, event.id, 'unmatched');
    const open =
      incident.status === 'pending_contact' || incident.status === 'contacting';
    const late =
      isTerminalAttempt(attempt.status) && event.status === 'answered';
    if (late) {
      await this.events.append(tx, {
        incidentId: incident.id,
        type: 'late_transport_answer',
        actorKind: 'provider',
        actorAccountId: null,
        actorInstallationId: null,
        context: { ordinal: attempt.ordinal },
      });
    }
    const next = toAttemptStatus(
      attempt.status,
      event.status,
      attempt.last_provider_rank,
    );
    const ended =
      event.status === 'completed' &&
      (attempt.status === 'answered_transport' ||
        attempt.status === 'human_confirmed');
    if (next === 'unchanged' && !ended) {
      return this.finish(
        tx,
        event.id,
        open ? (late ? 'applied' : 'ignored_older') : 'ignored_closed',
      );
    }
    const status = next === 'unchanged' ? attempt.status : next;
    const now = this.clock.now();
    const answeredAt =
      status === 'answered_transport' || status === 'human_confirmed'
        ? (attempt.answered_at ?? now)
        : attempt.answered_at;
    const endedAt =
      ended ||
      status === 'no_answer' ||
      status === 'busy' ||
      status === 'failed' ||
      status === 'canceled' ||
      status === 'human_confirmed'
        ? now
        : null;
    await tx.$executeRaw`
      UPDATE guardme.call_attempts
      SET status = ${status},
          last_provider_rank = ${Math.max(attempt.last_provider_rank, providerRank(event.status))}::smallint,
          answered_at = COALESCE(answered_at, ${answeredAt}::timestamptz),
          ended_at = COALESCE(ended_at, ${endedAt}::timestamptz)
      WHERE id = ${attempt.id}::uuid
    `;
    await this.events.append(tx, {
      incidentId: incident.id,
      type: 'call_attempt_result',
      actorKind: 'provider',
      actorAccountId: null,
      actorInstallationId: null,
      context: { ordinal: attempt.ordinal, status },
    });
    if (!open) return this.finish(tx, event.id, 'ignored_closed');
    if (
      status === 'answered_transport' &&
      attempt.status !== 'answered_transport'
    ) {
      await this.events.append(tx, {
        incidentId: incident.id,
        type: 'transport_answered',
        actorKind: 'provider',
        actorAccountId: null,
        actorInstallationId: null,
        context: { ordinal: attempt.ordinal },
      });
      await this.pending.enqueue(tx, {
        type: 'HUMAN_CONFIRM_TIMEOUT',
        resourceType: 'call_attempt',
        resourceId: attempt.id,
        dedupeKey: `call:${attempt.id}:human-confirm`,
        runAt: new Date(
          now.getTime() + this.policy.humanConfirmTimeoutSec * 1000,
        ),
      });
    }
    if (status === 'human_confirmed' && attempt.status !== 'human_confirmed') {
      assertTransition(incident.status, 'caregiver_informed');
      await tx.$executeRaw`
        UPDATE guardme.incidents
        SET status = 'caregiver_informed'
        WHERE id = ${incident.id}::uuid
      `;
      const stopped = await this.plans.stopPlan(
        tx,
        incident.id,
        'human_confirmed',
      );
      if (stopped.activeAttemptId && stopped.activeAttemptId !== attempt.id) {
        await this.pending.enqueue(tx, {
          type: 'CANCEL_ACTIVE_CALL',
          resourceType: 'call_attempt',
          resourceId: stopped.activeAttemptId,
          dedupeKey: `call:${stopped.activeAttemptId}:cancel`,
          runAt: now,
        });
      }
      await this.events.append(tx, {
        incidentId: incident.id,
        type: 'caregiver_informed',
        actorKind: 'provider',
        actorAccountId: null,
        actorInstallationId: null,
        context: { ordinal: attempt.ordinal },
      });
      await this.pending.enqueue(tx, {
        type: 'NOTIFY_INCIDENT_UPDATE',
        resourceType: 'incident',
        resourceId: incident.id,
        dedupeKey: `notify:incident:${incident.id}:human_confirmed`,
        runAt: now,
      });
    }
    if (unansweredTerminal(status) && !unansweredTerminal(attempt.status)) {
      assertTransition(incident.status, 'pending_contact');
      await tx.$executeRaw`
        UPDATE guardme.incidents
        SET status = 'pending_contact'
        WHERE id = ${incident.id}::uuid
      `;
      await this.enqueueNext(
        tx,
        attempt.call_plan_id,
        incident.id,
        attempt.ordinal,
        now,
      );
    }
    return this.finish(tx, event.id, 'applied');
  }

  private async enqueueNext(
    tx: Tx,
    planId: string,
    incidentId: string,
    ordinal: number,
    now: Date,
  ): Promise<void> {
    await this.pending.enqueue(tx, {
      type: 'START_NEXT_CALL_ATTEMPT',
      resourceType: 'incident',
      resourceId: incidentId,
      dedupeKey: `call:${planId}:start:${ordinal + 1}`,
      runAt: new Date(
        now.getTime() + this.policy.callPauseBetweenAttemptsSec * 1000,
      ),
    });
  }

  private async finish(
    tx: Tx,
    eventId: string,
    result: ApplyResult,
  ): Promise<ApplyResult> {
    await tx.$executeRaw`
      UPDATE guardme.provider_events
      SET applied_at = ${this.clock.now()}::timestamptz,
          apply_result = ${result}
      WHERE id = ${eventId}::uuid
        AND applied_at IS NULL
    `;
    return result;
  }
}

function unansweredTerminal(status: string): boolean {
  return (
    status === 'no_answer' ||
    status === 'busy' ||
    status === 'failed' ||
    status === 'canceled'
  );
}
