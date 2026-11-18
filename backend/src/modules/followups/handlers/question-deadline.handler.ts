import { Injectable } from '@nestjs/common';
import { ClockPort } from '../../../infra/clock/clock.port';
import { DbService, type Tx } from '../../../infra/db/db.service';
import {
  type ActionHandler,
  type HandlerResult,
  type PendingActionRow,
} from '../../pending-actions/action-handler';
import { nextFollowupStep } from '../followup-machine';
import {
  FollowupsService,
  machineRound,
  type FollowupLock,
  type QuestionLock,
} from '../followups.service';

@Injectable()
export class QuestionDeadlineHandler implements ActionHandler {
  readonly types = ['FOLLOWUP_QUESTION_DEADLINE'] as const;

  constructor(
    private readonly db: DbService,
    private readonly clock: ClockPort,
    private readonly followups: FollowupsService,
  ) {}

  handle(action: PendingActionRow): Promise<HandlerResult> {
    return this.db.asWorker((tx) => this.apply(tx, action));
  }

  private async apply(
    tx: Tx,
    action: PendingActionRow,
  ): Promise<HandlerResult> {
    const question = await lockQuestion(tx, action.resourceId);
    if (!question || question.status !== 'published') {
      return { outcome: 'discarded', reason: 'not_published' };
    }
    const applied = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM guardme.followup_responses
      WHERE question_id = ${question.id}::uuid AND applied
    `;
    if (applied[0]) return { outcome: 'discarded', reason: 'answered' };
    const now = this.clock.now();
    if (now.getTime() < question.deadline_at.getTime()) {
      const retryInSec = Math.max(
        1,
        Math.ceil((question.deadline_at.getTime() - now.getTime()) / 1000),
      );
      return { outcome: 'retry', error: 'before_deadline', retryInSec };
    }
    const followup = await lockFollowup(tx, question.followup_id);
    if (!followup || followup.status.startsWith('closed_')) {
      return { outcome: 'discarded', reason: 'followup_closed' };
    }
    await tx.$executeRaw`
      UPDATE guardme.followup_questions
      SET status = 'expired'
      WHERE id = ${question.id}::uuid
    `;
    const step = nextFollowupStep(followup.status, machineRound(question), {
      kind: 'deadline',
    });
    await this.followups.applyStep(tx, followup, step, now);
    return { outcome: 'done' };
  }
}

async function lockQuestion(
  tx: Tx,
  questionId: string,
): Promise<QuestionLock | undefined> {
  const rows = await tx.$queryRaw<QuestionLock[]>`
    SELECT
      q.id, q.followup_id, q.round, q.recipient_kind, q.recipient_account_ids,
      q.status, q.deadline_at, q.version, f.profile_id, f.incident_id, f.status AS followup_status
    FROM guardme.followup_questions q
    JOIN guardme.followups f ON f.id = q.followup_id
    WHERE q.id = ${questionId}::uuid
    FOR UPDATE OF q
  `;
  return rows[0];
}

async function lockFollowup(
  tx: Tx,
  followupId: string,
): Promise<FollowupLock | undefined> {
  const rows = await tx.$queryRaw<FollowupLock[]>`
    SELECT id, incident_id, profile_id, status, time_zone, closing_account_id
    FROM guardme.followups
    WHERE id = ${followupId}::uuid
    FOR UPDATE
  `;
  return rows[0];
}
