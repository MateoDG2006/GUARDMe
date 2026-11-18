import { Injectable } from '@nestjs/common';
import { PolicyConfig } from '../../../config/policy.config';
import { ClockPort } from '../../../infra/clock/clock.port';
import { DbService, type Tx } from '../../../infra/db/db.service';
import { TelephonyPort } from '../../../infra/telephony/telephony.port';
import {
  type ActionHandler,
  type HandlerResult,
  type PendingActionRow,
} from '../../pending-actions/action-handler';
import { PendingActionsService } from '../../pending-actions/pending-actions.service';
import type { AttemptStatus } from '../attempt-status';
import { ProviderEventApplierService } from '../provider-event-applier.service';

@Injectable()
export class ReconcileAttemptHandler implements ActionHandler {
  readonly types = ['RECONCILE_CALL_ATTEMPT'] as const;

  constructor(
    private readonly db: DbService,
    private readonly clock: ClockPort,
    private readonly policy: PolicyConfig,
    private readonly telephony: TelephonyPort,
    private readonly pending: PendingActionsService,
    private readonly applier: ProviderEventApplierService,
  ) {}

  async handle(action: PendingActionRow): Promise<HandlerResult> {
    const attemptId = action.resourceId;
    const current = await this.db.asWorker((tx) => this.load(tx, attemptId));
    if (!current) return { outcome: 'discarded', reason: 'missing_attempt' };
    if (
      current.status === 'human_confirmed' ||
      current.status === 'answered_transport' ||
      current.terminal
    ) {
      return { outcome: 'discarded', reason: 'closed_attempt' };
    }
    let snapshot: Awaited<ReturnType<TelephonyPort['findCallByAttempt']>>;
    try {
      snapshot = await this.telephony.findCallByAttempt(attemptId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'provider';
      return { outcome: 'retry', error: message, retryInSec: 15 };
    }
    if (!snapshot && current.status === 'uncertain') {
      await this.db.asWorker((tx) => this.notCreated(tx, current));
      return { outcome: 'done' };
    }
    if (!snapshot)
      return { outcome: 'retry', error: 'missing_call', retryInSec: 15 };
    await this.db.asWorker(async (tx) => {
      if (!current.providerRef) {
        await tx.$executeRaw`
          UPDATE guardme.call_attempts
          SET provider_ref = ${snapshot.providerRef}
          WHERE id = ${attemptId}::uuid
            AND provider_ref IS NULL
        `;
      }
      const eventKey = `reconcile:${attemptId}:${snapshot.status}`;
      const inserted = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO guardme.provider_events (
          provider, event_key, provider_ref, status, provider_timestamp
        )
        VALUES (
          ${this.telephony.provider},
          ${eventKey},
          ${snapshot.providerRef},
          ${snapshot.status},
          ${snapshot.at}::timestamptz
        )
        ON CONFLICT (provider, event_key) DO NOTHING
        RETURNING id
      `;
      const id =
        inserted[0]?.id ??
        (
          await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM guardme.provider_events
            WHERE provider = ${this.telephony.provider}
              AND event_key = ${eventKey}
          `
        )[0]?.id;
      if (!id) return;
      await this.applier.apply(tx, {
        id,
        providerRef: snapshot.providerRef,
        status: snapshot.status,
      });
    });
    if (snapshot.status === 'queued' || snapshot.status === 'ringing') {
      return { outcome: 'retry', error: 'in_progress', retryInSec: 15 };
    }
    return { outcome: 'done' };
  }

  private async load(tx: Tx, attemptId: string) {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        status: AttemptStatus;
        call_plan_id: string;
        incident_id: string;
        ordinal: number;
        provider_ref: string | null;
      }>
    >`
      SELECT id, status, call_plan_id, incident_id, ordinal, provider_ref
      FROM guardme.call_attempts
      WHERE id = ${attemptId}::uuid
    `;
    const row = rows[0];
    if (!row) return null;
    const terminal = [
      'answered_unconfirmed',
      'no_answer',
      'busy',
      'failed',
      'canceled',
      'skipped',
    ].includes(row.status);
    return { ...row, terminal, providerRef: row.provider_ref };
  }

  private async notCreated(
    tx: Tx,
    attempt: {
      id: string;
      call_plan_id: string;
      incident_id: string;
      ordinal: number;
    },
  ): Promise<void> {
    const now = this.clock.now();
    await tx.$executeRaw`
      UPDATE guardme.call_attempts
      SET status = 'failed', status_reason = 'not_created', ended_at = ${now}::timestamptz
      WHERE id = ${attempt.id}::uuid
    `;
    await tx.$executeRaw`
      UPDATE guardme.incidents
      SET status = 'pending_contact'
      WHERE id = ${attempt.incident_id}::uuid
        AND status = 'contacting'
    `;
    await this.pending.enqueue(tx, {
      type: 'START_NEXT_CALL_ATTEMPT',
      resourceType: 'incident',
      resourceId: attempt.incident_id,
      dedupeKey: `call:${attempt.call_plan_id}:start:${attempt.ordinal + 1}`,
      runAt: new Date(
        now.getTime() + this.policy.callPauseBetweenAttemptsSec * 1000,
      ),
    });
  }
}
