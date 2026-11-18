import { Injectable } from '@nestjs/common';
import { PolicyConfig } from '../../../config/policy.config';
import { ClockPort } from '../../../infra/clock/clock.port';
import { DbService, type Tx } from '../../../infra/db/db.service';
import {
  TelephonyPort,
  type CreateCallResult,
} from '../../../infra/telephony/telephony.port';
import { IncidentEventsService } from '../../incidents/incident-events.service';
import {
  assertTransition,
  type IncidentStatus,
} from '../../incidents/incident-state';
import {
  type ActionHandler,
  type HandlerResult,
  type PendingActionRow,
} from '../../pending-actions/action-handler';
import { PendingActionsService } from '../../pending-actions/pending-actions.service';

@Injectable()
export class StartNextAttemptHandler implements ActionHandler {
  readonly types = ['START_NEXT_CALL_ATTEMPT'] as const;

  constructor(
    private readonly db: DbService,
    private readonly clock: ClockPort,
    private readonly policy: PolicyConfig,
    private readonly events: IncidentEventsService,
    private readonly pending: PendingActionsService,
    private readonly telephony: TelephonyPort,
  ) {}

  async handle(action: PendingActionRow): Promise<HandlerResult> {
    const prepared = await this.db.asWorker((tx) => this.prepare(tx, action));
    if (prepared.outcome !== 'call') return prepared.result;
    let result: CreateCallResult;
    try {
      result = await this.telephony.createCall({
        attemptId: prepared.attemptId,
        to: prepared.phone,
        ringTimeoutSec: this.policy.callRingTimeoutSec,
        incidentId: prepared.incidentId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'uncertain';
      result = { status: 'uncertain', error: message };
    }
    return this.db.asWorker((tx) => this.record(tx, prepared, result));
  }

  private async prepare(
    tx: Tx,
    action: PendingActionRow,
  ): Promise<
    | { outcome: 'stop'; result: HandlerResult }
    | {
        outcome: 'call';
        attemptId: string;
        planId: string;
        incidentId: string;
        ordinal: number;
        phone: string;
      }
  > {
    const incidents = await tx.$queryRaw<
      Array<{ id: string; status: IncidentStatus; profile_id: string }>
    >`
      SELECT id, status, profile_id
      FROM guardme.incidents
      WHERE id = ${action.resourceId}::uuid
      FOR UPDATE
    `;
    const incident = incidents[0];
    if (!incident)
      return stop({ outcome: 'discarded', reason: 'missing_incident' });
    if (
      incident.status !== 'pending_contact' &&
      incident.status !== 'contacting'
    ) {
      return stop({ outcome: 'discarded', reason: 'not_contacting' });
    }
    const active = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM guardme.call_attempts
      WHERE incident_id = ${incident.id}::uuid
        AND status IN ('requesting', 'ringing', 'answered_transport', 'uncertain')
    `;
    if (active[0])
      return stop({ outcome: 'discarded', reason: 'attempt_active' });
    const planned = await tx.$queryRaw<
      Array<{
        id: string;
        call_plan_id: string;
        ordinal: number;
        contact_id: string;
        contact_phone_e164: string;
        linked_account_id: string | null;
      }>
    >`
      SELECT id, call_plan_id, ordinal, contact_id, contact_phone_e164, linked_account_id
      FROM guardme.call_attempts
      WHERE incident_id = ${incident.id}::uuid
        AND status = 'planned'
      ORDER BY ordinal
      LIMIT 1
    `;
    const next = planned[0];
    if (!next) {
      await this.exhaust(tx, incident.id, incident.status);
      return stop({ outcome: 'done' });
    }
    if (
      await this.contactGone(
        tx,
        incident.profile_id,
        next.contact_id,
        next.linked_account_id,
      )
    ) {
      await tx.$executeRaw`
        UPDATE guardme.call_attempts
        SET status = 'skipped', status_reason = 'contact_removed'
        WHERE id = ${next.id}::uuid
      `;
      await this.events.append(tx, {
        incidentId: incident.id,
        type: 'call_attempt_skipped',
        actorKind: 'system',
        actorAccountId: null,
        actorInstallationId: null,
        context: { ordinal: next.ordinal },
      });
      await this.enqueueNext(
        tx,
        next.call_plan_id,
        incident.id,
        next.ordinal,
        this.clock.now(),
        0,
      );
      return stop({ outcome: 'done' });
    }
    const now = this.clock.now();
    await tx.$executeRaw`
      UPDATE guardme.call_attempts
      SET status = 'requesting', requested_at = ${now}::timestamptz
      WHERE id = ${next.id}::uuid
    `;
    assertTransition(incident.status, 'contacting');
    await tx.$executeRaw`
      UPDATE guardme.incidents
      SET status = 'contacting'
      WHERE id = ${incident.id}::uuid
    `;
    await this.events.append(tx, {
      incidentId: incident.id,
      type: 'call_attempt_requested',
      actorKind: 'system',
      actorAccountId: null,
      actorInstallationId: null,
      context: { ordinal: next.ordinal },
    });
    return {
      outcome: 'call',
      attemptId: next.id,
      planId: next.call_plan_id,
      incidentId: incident.id,
      ordinal: next.ordinal,
      phone: next.contact_phone_e164,
    };
  }

  private async record(
    tx: Tx,
    prepared: {
      attemptId: string;
      planId: string;
      incidentId: string;
      ordinal: number;
    },
    result: CreateCallResult,
  ): Promise<HandlerResult> {
    const now = this.clock.now();
    if (result.status === 'requested') {
      await tx.$executeRaw`
        UPDATE guardme.call_attempts
        SET provider_ref = ${result.providerRef}
        WHERE id = ${prepared.attemptId}::uuid
      `;
      await this.pending.enqueue(tx, {
        type: 'RECONCILE_CALL_ATTEMPT',
        resourceType: 'call_attempt',
        resourceId: prepared.attemptId,
        dedupeKey: `call:${prepared.attemptId}:reconcile`,
        // Sin StatusCallback: primer poll ~15s; reintentos los decide ReconcileAttemptHandler.
        runAt: new Date(now.getTime() + 15_000),
      });
      return { outcome: 'done' };
    }
    if (result.status === 'uncertain') {
      await tx.$executeRaw`
        UPDATE guardme.call_attempts
        SET status = 'uncertain', status_reason = ${result.error}
        WHERE id = ${prepared.attemptId}::uuid
      `;
      await this.pending.enqueue(tx, {
        type: 'RECONCILE_CALL_ATTEMPT',
        resourceType: 'call_attempt',
        resourceId: prepared.attemptId,
        dedupeKey: `call:${prepared.attemptId}:reconcile`,
        runAt: new Date(now.getTime() + 15_000),
      });
      return { outcome: 'done' };
    }
    await tx.$executeRaw`
      UPDATE guardme.call_attempts
      SET status = 'failed', status_reason = ${result.error}, ended_at = ${now}::timestamptz
      WHERE id = ${prepared.attemptId}::uuid
    `;
    assertTransition('contacting', 'pending_contact');
    await tx.$executeRaw`
      UPDATE guardme.incidents
      SET status = 'pending_contact'
      WHERE id = ${prepared.incidentId}::uuid
    `;
    await this.enqueueNext(
      tx,
      prepared.planId,
      prepared.incidentId,
      prepared.ordinal,
      now,
      this.policy.callPauseBetweenAttemptsSec,
    );
    return { outcome: 'done' };
  }

  private async contactGone(
    tx: Tx,
    profileId: string,
    contactId: string,
    linkedAccountId: string | null,
  ): Promise<boolean> {
    const contacts = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM guardme.contacts WHERE id = ${contactId}::uuid
    `;
    if (contacts[0]?.status === 'removed') return true;
    if (!linkedAccountId) return false;
    const access = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM guardme.profile_access
      WHERE profile_id = ${profileId}::uuid
        AND account_id = ${linkedAccountId}::uuid
        AND status = 'active'
    `;
    return !access[0];
  }

  private async exhaust(
    tx: Tx,
    incidentId: string,
    status: IncidentStatus,
  ): Promise<void> {
    assertTransition(status, 'escalation_required');
    await tx.$executeRaw`
      UPDATE guardme.call_plans
      SET status = 'exhausted'
      WHERE incident_id = ${incidentId}::uuid
        AND status = 'active'
    `;
    await tx.$executeRaw`
      UPDATE guardme.incidents
      SET status = 'escalation_required', escalation_reason = 'attempts_exhausted'
      WHERE id = ${incidentId}::uuid
    `;
    await this.events.append(tx, {
      incidentId,
      type: 'call_plan_exhausted',
      actorKind: 'system',
      actorAccountId: null,
      actorInstallationId: null,
      context: { reason: 'attempts_exhausted' },
    });
    await this.events.append(tx, {
      incidentId,
      type: 'escalation_required',
      actorKind: 'system',
      actorAccountId: null,
      actorInstallationId: null,
      context: { reason: 'attempts_exhausted' },
    });
    await this.pending.enqueue(tx, {
      type: 'NOTIFY_INCIDENT_UPDATE',
      resourceType: 'incident',
      resourceId: incidentId,
      dedupeKey: `notify:incident:${incidentId}:attempts_exhausted`,
      runAt: this.clock.now(),
    });
  }

  private enqueueNext(
    tx: Tx,
    planId: string,
    incidentId: string,
    ordinal: number,
    now: Date,
    pauseSec: number,
  ): Promise<void> {
    return this.pending.enqueue(tx, {
      type: 'START_NEXT_CALL_ATTEMPT',
      resourceType: 'incident',
      resourceId: incidentId,
      dedupeKey: `call:${planId}:start:${ordinal + 1}`,
      runAt: new Date(now.getTime() + pauseSec * 1000),
    });
  }
}

function stop(result: HandlerResult): {
  outcome: 'stop';
  result: HandlerResult;
} {
  return { outcome: 'stop', result };
}
