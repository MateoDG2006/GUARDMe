import { Injectable } from '@nestjs/common';
import { ClockPort } from '../../../infra/clock/clock.port';
import { DbService } from '../../../infra/db/db.service';
import { TelephonyPort } from '../../../infra/telephony/telephony.port';
import {
  type ActionHandler,
  type HandlerResult,
  type PendingActionRow,
} from '../../pending-actions/action-handler';
import { ACTIVE_ATTEMPT_STATUSES } from '../attempt-status';

@Injectable()
export class CancelActiveCallHandler implements ActionHandler {
  readonly types = ['CANCEL_ACTIVE_CALL'] as const;

  constructor(
    private readonly db: DbService,
    private readonly clock: ClockPort,
    private readonly telephony: TelephonyPort,
  ) {}

  async handle(action: PendingActionRow): Promise<HandlerResult> {
    const attempt = await this.db.asWorker(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string; status: string; provider_ref: string | null }>
      >`
        SELECT id, status, provider_ref
        FROM guardme.call_attempts
        WHERE id = ${action.resourceId}::uuid
      `;
      return rows[0] ?? null;
    });
    if (!attempt) return { outcome: 'discarded', reason: 'missing_attempt' };
    if (
      !(ACTIVE_ATTEMPT_STATUSES as readonly string[]).includes(attempt.status)
    ) {
      return { outcome: 'discarded', reason: 'not_active' };
    }
    if (attempt.provider_ref)
      await this.telephony.cancelCall(attempt.provider_ref);
    const now = this.clock.now();
    await this.db.asWorker((tx) => {
      return tx.$executeRaw`
        UPDATE guardme.call_attempts
        SET status = 'canceled',
            status_reason = 'superseded_by_decision',
            ended_at = ${now}::timestamptz
        WHERE id = ${attempt.id}::uuid
          AND status IN ('requesting', 'ringing', 'answered_transport', 'uncertain')
      `;
    });
    return { outcome: 'done' };
  }
}
