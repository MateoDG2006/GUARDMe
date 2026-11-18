import { Injectable } from '@nestjs/common';
import { PolicyConfig } from '../../../config/policy.config';
import { ClockPort } from '../../../infra/clock/clock.port';
import { DbService, type Tx } from '../../../infra/db/db.service';
import { IncidentEventsService } from '../../incidents/incident-events.service';
import { assertTransition } from '../../incidents/incident-state';
import {
  type ActionHandler,
  type HandlerResult,
  type PendingActionRow,
} from '../../pending-actions/action-handler';
import { PendingActionsService } from '../../pending-actions/pending-actions.service';

@Injectable()
export class HumanConfirmTimeoutHandler implements ActionHandler {
  readonly types = ['HUMAN_CONFIRM_TIMEOUT'] as const;

  constructor(
    private readonly db: DbService,
    private readonly clock: ClockPort,
    private readonly policy: PolicyConfig,
    private readonly events: IncidentEventsService,
    private readonly pending: PendingActionsService,
  ) {}

  handle(action: PendingActionRow): Promise<HandlerResult> {
    if (this.policy.onUnconfirmedAnswer !== 'continue') {
      throw new Error('PD03_ON_UNCONFIRMED_ANSWER no está implementado');
    }
    return this.db.asWorker((tx) => this.apply(tx, action.resourceId));
  }

  private async apply(tx: Tx, attemptId: string): Promise<HandlerResult> {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        status: string;
        call_plan_id: string;
        incident_id: string;
        ordinal: number;
        incident_status: string;
      }>
    >`
      SELECT
        a.id, a.status, a.call_plan_id, a.incident_id, a.ordinal, i.status AS incident_status
      FROM guardme.call_attempts a
      JOIN guardme.incidents i ON i.id = a.incident_id
      WHERE a.id = ${attemptId}::uuid
      FOR UPDATE OF a, i
    `;
    const attempt = rows[0];
    if (!attempt) return { outcome: 'discarded', reason: 'missing_attempt' };
    if (
      attempt.status !== 'answered_transport' ||
      attempt.incident_status !== 'contacting'
    ) {
      return { outcome: 'discarded', reason: 'not_waiting' };
    }
    // PD-03 pendiente: buzón / respuesta no humana
    const now = this.clock.now();
    await tx.$executeRaw`
      UPDATE guardme.call_attempts
      SET status = 'answered_unconfirmed', ended_at = ${now}::timestamptz
      WHERE id = ${attempt.id}::uuid
    `;
    await this.events.append(tx, {
      incidentId: attempt.incident_id,
      type: 'human_confirm_timeout',
      actorKind: 'system',
      actorAccountId: null,
      actorInstallationId: null,
      context: { ordinal: attempt.ordinal },
    });
    assertTransition('contacting', 'pending_contact');
    await tx.$executeRaw`
      UPDATE guardme.incidents
      SET status = 'pending_contact'
      WHERE id = ${attempt.incident_id}::uuid
    `;
    await this.pending.enqueue(tx, {
      type: 'START_NEXT_CALL_ATTEMPT',
      resourceType: 'incident',
      resourceId: attempt.incident_id,
      dedupeKey: `call:${attempt.call_plan_id}:start:${attempt.ordinal + 1}`,
      runAt: now,
    });
    return { outcome: 'done' };
  }
}
