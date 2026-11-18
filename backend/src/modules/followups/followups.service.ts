import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainError } from '../../common/errors/domain-error';
import { PolicyConfig } from '../../config/policy.config';
import { ClockPort } from '../../infra/clock/clock.port';
import { DbService, type Tx } from '../../infra/db/db.service';
import { toAccountContext, type Principal } from '../identity/principal';
import { PendingActionsService } from '../pending-actions/pending-actions.service';
import { AccessService } from '../profiles/access.service';
import type { RespondFollowupDto } from './dto/respond-followup.dto';
import {
  nextFollowupStep,
  type FollowupOption,
  type FollowupRound,
  type FollowupStatus,
} from './followup-machine';
import {
  firstQuestionAt,
  lastQuestionAt,
  plusSeconds,
} from './followup-schedule';

export interface FollowupIncidentRef {
  id: string;
}

export interface PendingQuestionView {
  questionId: string;
  followupId: string;
  incidentId: string;
  profileId: string;
  profileName: string;
  round: FollowupRound;
  publishedAt: string;
  deadlineAt: string;
  options: ['well', 'not_well', 'no_followup_needed'];
}

export interface RespondFollowupResult {
  applied: boolean;
  followupStatus: FollowupStatus;
  showEncouragement: boolean;
}

export interface FollowupDetail {
  id: string;
  status: FollowupStatus;
  rounds: Array<{
    round: FollowupRound;
    recipientKind: 'user' | 'caregiver';
    publishAt: string;
    publishedAt: string | null;
    deadlineAt: string;
    status: string;
    answer: {
      option: FollowupOption;
      byDisplayName: string;
      at: string;
    } | null;
  }>;
}

const OPTIONS = ['well', 'not_well', 'no_followup_needed'] as const;

@Injectable()
export class FollowupsService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockPort,
    private readonly policy: PolicyConfig,
    private readonly pending: PendingActionsService,
    private readonly access: AccessService,
  ) {}

  async createForIncident(
    tx: Tx,
    incident: FollowupIncidentRef,
  ): Promise<void> {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        profile_id: string;
        closed_at: Date;
        closed_by_account_id: string;
        time_zone: string;
      }>
    >`
      SELECT i.id, i.profile_id, i.closed_at, i.closed_by_account_id, p.time_zone
      FROM guardme.incidents i
      JOIN guardme.profiles p ON p.id = i.profile_id
      WHERE i.id = ${incident.id}::uuid
    `;
    const current = rows[0];
    if (!current?.closed_at || !current.closed_by_account_id) {
      throw new DomainError('INCOMPATIBLE_STATE');
    }
    const users = await this.access.listActiveAccounts(
      tx,
      current.profile_id,
      'user',
    );
    const noUser = users.length === 0;
    const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO guardme.followups (
        incident_id, profile_id, closing_account_id, time_zone, status
      )
      VALUES (
        ${current.id}::uuid,
        ${current.profile_id}::uuid,
        ${current.closed_by_account_id}::uuid,
        ${current.time_zone},
        'scheduled'
      )
      RETURNING id
    `;
    const followupId = inserted[0]?.id;
    if (!followupId) throw new DomainError('NOT_FOUND');
    const publishAt = firstQuestionAt(
      current.closed_at,
      current.time_zone,
      this.policy.followupFirstLocalHour,
    );
    const deadlineAt = plusSeconds(
      publishAt,
      this.policy.followupUserWindowSec,
    );
    await this.scheduleQuestion(tx, {
      followupId,
      round: 'first',
      recipientKind: noUser ? 'caregiver' : 'user',
      publishAt,
      deadlineAt,
    });
    await this.appendEvent(tx, current.id, {
      reason: noUser ? 'no_user_account' : undefined,
    });
    // PD-07 pendiente
  }

  pendingForMe(principal: Principal): Promise<PendingQuestionView[]> {
    if (!principal.accountId) throw new DomainError('ACCOUNT_NOT_BOOTSTRAPPED');
    const accountId = principal.accountId;
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          followup_id: string;
          incident_id: string;
          profile_id: string;
          profile_name: string;
          round: FollowupRound;
          published_at: Date;
          deadline_at: Date;
        }>
      >`
        SELECT
          q.id, q.followup_id, f.incident_id, f.profile_id, p.display_name AS profile_name,
          q.round, q.published_at, q.deadline_at
        FROM guardme.followup_questions q
        JOIN guardme.followups f ON f.id = q.followup_id
        JOIN guardme.profiles p ON p.id = f.profile_id
        WHERE q.status = 'published'
          AND ${accountId}::uuid = ANY(q.recipient_account_ids)
        ORDER BY q.deadline_at, q.id
      `;
      return rows.map((row) => ({
        questionId: row.id,
        followupId: row.followup_id,
        incidentId: row.incident_id,
        profileId: row.profile_id,
        profileName: row.profile_name,
        round: row.round,
        publishedAt: row.published_at.toISOString(),
        deadlineAt: row.deadline_at.toISOString(),
        options: [...OPTIONS],
      }));
    });
  }

  respond(
    principal: Principal,
    questionId: string,
    input: RespondFollowupDto,
  ): Promise<RespondFollowupResult> {
    if (!principal.accountId) throw new DomainError('ACCOUNT_NOT_BOOTSTRAPPED');
    const accountId = principal.accountId;
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const question = await this.lockQuestion(tx, questionId);
      if (!question.recipient_account_ids.includes(accountId)) {
        throw new DomainError('NOT_FOUND');
      }
      await this.access.requireAccess(tx, question.profile_id);
      const followup = await this.lockFollowup(tx, question.followup_id);
      const previous = await tx.$queryRaw<
        Array<{ account_id: string; option: FollowupOption; applied: boolean }>
      >`
        SELECT account_id, option, applied
        FROM guardme.followup_responses
        WHERE question_id = ${questionId}::uuid
          AND account_id = ${accountId}::uuid
          AND option = ${input.option}
      `;
      if (question.status === 'answered' && previous[0]) {
        return {
          applied: previous[0].applied,
          followupStatus: followup.status,
          showEncouragement: false,
        };
      }
      if (question.status === 'expired' || question.status === 'answered') {
        await this.insertResponse(
          tx,
          questionId,
          accountId,
          input.option,
          false,
        );
        return {
          applied: false,
          followupStatus: followup.status,
          showEncouragement: false,
        };
      }
      if (question.status !== 'published') {
        throw new DomainError('INCOMPATIBLE_STATE');
      }
      const step = nextFollowupStep(followup.status, machineRound(question), {
        kind: 'answer',
        option: input.option,
      });
      await this.insertResponse(tx, questionId, accountId, input.option, true);
      await tx.$executeRaw`
        UPDATE guardme.followup_questions
        SET status = 'answered'
        WHERE id = ${questionId}::uuid
      `;
      await this.applyStep(tx, followup, step, this.clock.now());
      return {
        applied: true,
        followupStatus: step.status,
        showEncouragement: step.showEncouragement ?? false,
      };
    });
  }

  async forIncident(
    tx: Tx,
    incidentId: string,
  ): Promise<FollowupDetail | null> {
    const followups = await tx.$queryRaw<
      Array<{ id: string; status: FollowupStatus }>
    >`
      SELECT id, status FROM guardme.followups WHERE incident_id = ${incidentId}::uuid
    `;
    const followup = followups[0];
    if (!followup) return null;
    const rounds = await tx.$queryRaw<
      Array<{
        round: FollowupRound;
        recipient_kind: 'user' | 'caregiver';
        publish_at: Date;
        published_at: Date | null;
        deadline_at: Date;
        status: string;
        option: FollowupOption | null;
        display_name: string | null;
        answered_at: Date | null;
      }>
    >`
      SELECT
        q.round, q.recipient_kind, q.publish_at, q.published_at, q.deadline_at, q.status,
        r.option, a.display_name, r.at AS answered_at
      FROM guardme.followup_questions q
      LEFT JOIN guardme.followup_responses r
        ON r.question_id = q.id AND r.applied
      LEFT JOIN guardme.accounts a ON a.id = r.account_id
      WHERE q.followup_id = ${followup.id}::uuid
      ORDER BY q.publish_at, q.id
    `;
    return {
      id: followup.id,
      status: followup.status,
      rounds: rounds.map((round) => ({
        round: round.round,
        recipientKind: round.recipient_kind,
        publishAt: round.publish_at.toISOString(),
        publishedAt: round.published_at?.toISOString() ?? null,
        deadlineAt: round.deadline_at.toISOString(),
        status: round.status,
        answer: round.option
          ? {
              option: round.option,
              byDisplayName: round.display_name ?? '',
              at: round.answered_at?.toISOString() ?? '',
            }
          : null,
      })),
    };
  }

  async scheduleQuestion(
    tx: Tx,
    input: {
      followupId: string;
      round: FollowupRound;
      recipientKind: 'user' | 'caregiver';
      publishAt: Date;
      deadlineAt: Date;
    },
  ): Promise<string> {
    const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO guardme.followup_questions (
        followup_id, round, recipient_kind, publish_at, deadline_at
      )
      VALUES (
        ${input.followupId}::uuid,
        ${input.round},
        ${input.recipientKind},
        ${input.publishAt}::timestamptz,
        ${input.deadlineAt}::timestamptz
      )
      RETURNING id
    `;
    const id = inserted[0]?.id;
    if (!id) throw new DomainError('NOT_FOUND');
    await this.pending.enqueue(tx, {
      type: 'FOLLOWUP_PUBLISH_QUESTION',
      resourceType: 'followup_question',
      resourceId: id,
      dedupeKey: `followup:${id}:publish`,
      runAt: input.publishAt,
    });
    await this.pending.enqueue(tx, {
      type: 'FOLLOWUP_QUESTION_DEADLINE',
      resourceType: 'followup_question',
      resourceId: id,
      dedupeKey: `followup:${id}:deadline`,
      runAt: input.deadlineAt,
    });
    return id;
  }

  async applyStep(
    tx: Tx,
    followup: { id: string; time_zone: string },
    step: {
      status: FollowupStatus;
      createRound?: 'caregiver' | 'last';
      closeAs?: FollowupStatus;
    },
    now: Date,
  ): Promise<void> {
    if (step.createRound === 'caregiver') {
      const deadlineAt = plusSeconds(
        now,
        this.policy.followupCaregiverWindowSec,
      );
      await this.scheduleQuestion(tx, {
        followupId: followup.id,
        round: 'caregiver',
        recipientKind: 'caregiver',
        publishAt: now,
        deadlineAt,
      });
    }
    if (step.createRound === 'last') {
      const publishAt = lastQuestionAt(
        now,
        followup.time_zone,
        this.policy.followupFirstLocalHour,
        this.policy.followupLastDelayDays,
      );
      await this.scheduleQuestion(tx, {
        followupId: followup.id,
        round: 'last',
        recipientKind: this.policy.followupLastRecipient,
        publishAt,
        deadlineAt: plusSeconds(publishAt, this.policy.followupLastWindowSec),
      });
    }
    await tx.$executeRaw`
      UPDATE guardme.followups
      SET status = ${step.status},
          closed_at = ${step.closeAs ? now : null}::timestamptz
      WHERE id = ${followup.id}::uuid
    `;
  }

  async appendEvent(
    tx: Tx,
    incidentId: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    const cleaned = Object.fromEntries(
      Object.entries(context).filter(([, value]) => value !== undefined),
    );
    await tx.$executeRaw`
      INSERT INTO guardme.incident_events (
        incident_id, type, actor_kind, at, context
      )
      VALUES (
        ${incidentId}::uuid,
        'followup_created',
        'system',
        ${this.clock.now()}::timestamptz,
        ${JSON.stringify(cleaned)}::jsonb
      )
    `;
  }

  private async insertResponse(
    tx: Tx,
    questionId: string,
    accountId: string,
    option: FollowupOption,
    applied: boolean,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO guardme.followup_responses (question_id, account_id, option, applied, at)
      VALUES (
        ${questionId}::uuid,
        ${accountId}::uuid,
        ${option},
        ${applied},
        ${this.clock.now()}::timestamptz
      )
    `;
  }

  private async lockQuestion(
    tx: Tx,
    questionId: string,
  ): Promise<QuestionLock> {
    const rows = await tx.$queryRaw<QuestionLock[]>`
      SELECT
        q.id, q.followup_id, q.round, q.recipient_kind, q.recipient_account_ids,
        q.status, q.deadline_at, q.version, f.profile_id, f.incident_id, f.status AS followup_status
      FROM guardme.followup_questions q
      JOIN guardme.followups f ON f.id = q.followup_id
      WHERE q.id = ${questionId}::uuid
      FOR UPDATE OF q
    `;
    const row = rows[0];
    if (!row) throw new DomainError('NOT_FOUND');
    return row;
  }

  private async lockFollowup(
    tx: Tx,
    followupId: string,
  ): Promise<FollowupLock> {
    const rows = await tx.$queryRaw<FollowupLock[]>`
      SELECT id, incident_id, profile_id, status, time_zone, closing_account_id
      FROM guardme.followups
      WHERE id = ${followupId}::uuid
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) throw new DomainError('NOT_FOUND');
    return row;
  }
}

export interface QuestionLock {
  id: string;
  followup_id: string;
  round: FollowupRound;
  recipient_kind: 'user' | 'caregiver';
  recipient_account_ids: string[];
  status: string;
  deadline_at: Date;
  version: number;
  profile_id: string;
  incident_id: string;
  followup_status: FollowupStatus;
}

export interface FollowupLock {
  id: string;
  incident_id: string;
  profile_id: string;
  status: FollowupStatus;
  time_zone: string;
  closing_account_id: string;
}

export function machineRound(question: {
  round: FollowupRound;
  recipient_kind: 'user' | 'caregiver';
}): FollowupRound {
  if (question.round === 'first' && question.recipient_kind === 'caregiver') {
    return 'caregiver';
  }
  return question.round;
}

export function awaitingStatus(round: FollowupRound): FollowupStatus {
  if (round === 'caregiver') return 'awaiting_caregiver';
  if (round === 'last') return 'awaiting_last';
  return 'awaiting_user';
}

export async function writeRecipients(
  tx: Tx,
  questionId: string,
  accountIds: string[],
  publishedAt: Date,
): Promise<number> {
  const recipients =
    accountIds.length === 0
      ? Prisma.sql`'{}'::uuid[]`
      : Prisma.sql`ARRAY[${Prisma.join(accountIds)}]::uuid[]`;
  const rows = await tx.$queryRaw<Array<{ version: number }>>`
    UPDATE guardme.followup_questions
    SET status = 'published',
        published_at = ${publishedAt}::timestamptz,
        recipient_account_ids = ${recipients}
    WHERE id = ${questionId}::uuid
    RETURNING version
  `;
  return rows[0]?.version ?? 1;
}
