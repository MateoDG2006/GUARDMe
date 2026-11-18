import { Injectable } from '@nestjs/common';
import { PolicyConfig } from '../../../config/policy.config';
import { ClockPort } from '../../../infra/clock/clock.port';
import { DbService, type Tx } from '../../../infra/db/db.service';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  type ActionHandler,
  type HandlerResult,
  type PendingActionRow,
} from '../../pending-actions/action-handler';
import { AccessService } from '../../profiles/access.service';
import {
  awaitingStatus,
  machineRound,
  writeRecipients,
  type FollowupLock,
  type QuestionLock,
} from '../followups.service';

@Injectable()
export class PublishQuestionHandler implements ActionHandler {
  readonly types = ['FOLLOWUP_PUBLISH_QUESTION'] as const;

  constructor(
    private readonly db: DbService,
    private readonly clock: ClockPort,
    private readonly policy: PolicyConfig,
    private readonly notifications: NotificationsService,
    private readonly access: AccessService,
  ) {}

  handle(action: PendingActionRow): Promise<HandlerResult> {
    return this.db.asWorker((tx) => this.apply(tx, action));
  }

  private async apply(
    tx: Tx,
    action: PendingActionRow,
  ): Promise<HandlerResult> {
    const question = await lockQuestion(tx, action.resourceId);
    if (!question || question.status !== 'scheduled') {
      return { outcome: 'discarded', reason: 'not_scheduled' };
    }
    const followup = await lockFollowup(tx, question.followup_id);
    if (!followup || followup.status.startsWith('closed_')) {
      return { outcome: 'discarded', reason: 'followup_closed' };
    }
    const resolved = await this.recipients(tx, followup, question);
    const now = this.clock.now();
    const version = await writeRecipients(
      tx,
      question.id,
      resolved.accountIds,
      now,
    );
    const round = machineRound(question);
    await tx.$executeRaw`
      UPDATE guardme.followups
      SET status = ${awaitingStatus(round)}
      WHERE id = ${followup.id}::uuid
    `;
    if (resolved.reason || resolved.accountIds.length === 0) {
      await tx.$executeRaw`
        INSERT INTO guardme.incident_events (
          incident_id, type, actor_kind, at, context
        )
        VALUES (
          ${followup.incident_id}::uuid,
          'followup_created',
          'system',
          ${now}::timestamptz,
          ${JSON.stringify({
            reason: resolved.reason,
            recipients: resolved.accountIds.length,
          })}::jsonb
        )
      `;
    }
    await this.notifications.createForRecipients(tx, {
      type: 'followup_question',
      profileId: followup.profile_id,
      recipientAccountIds: resolved.accountIds,
      resourceType: 'followup_question',
      resourceId: question.id,
      resourceVersion: version,
      dedupeScope: `followup:${question.id}`,
      priority: 'agenda',
      expiresAt: question.deadline_at,
    });
    return { outcome: 'done' };
  }

  private async recipients(
    tx: Tx,
    followup: FollowupLock,
    question: QuestionLock,
  ): Promise<{ accountIds: string[]; reason?: string }> {
    const kind =
      question.round === 'last'
        ? this.policy.followupLastRecipient
        : question.recipient_kind;
    if (kind === 'user') {
      const users = await this.access.listActiveAccounts(
        tx,
        followup.profile_id,
        'user',
      );
      if (users.length > 0) {
        return { accountIds: users.map((user) => user.accountId) };
      }
      return {
        accountIds: await this.caregivers(tx, followup, false),
        reason: 'recipient_revoked_fallback',
      };
    }
    const closing = await this.access.listActiveAccounts(
      tx,
      followup.profile_id,
      'caregiver',
    );
    const stillClosing = closing.some(
      (account) => account.accountId === followup.closing_account_id,
    );
    if (
      this.policy.followupCaregiverRecipient === 'closing_caregiver' &&
      stillClosing
    ) {
      return { accountIds: [followup.closing_account_id] };
    }
    return {
      accountIds: closing.map((account) => account.accountId),
      reason: stillClosing ? undefined : 'recipient_revoked_fallback',
    };
  }

  private async caregivers(
    tx: Tx,
    followup: FollowupLock,
    onlyClosing: boolean,
  ): Promise<string[]> {
    const accounts = await this.access.listActiveAccounts(
      tx,
      followup.profile_id,
      'caregiver',
    );
    if (!onlyClosing) return accounts.map((account) => account.accountId);
    return accounts
      .filter((account) => account.accountId === followup.closing_account_id)
      .map((account) => account.accountId);
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
