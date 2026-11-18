import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { DomainError } from '../../common/errors/domain-error';
import { PolicyConfig } from '../../config/policy.config';
import { ClockPort } from '../../infra/clock/clock.port';
import { DbService, type Tx } from '../../infra/db/db.service';
import { AuditService } from '../audit/audit.service';
import { SyncSignalService } from '../sync/sync-signal.service';
import { toAccountContext, type Principal } from '../identity/principal';
import { AccessService, type Relation } from '../profiles/access.service';
import type {
  CreateReminderDto,
  ScheduleDto,
  UpdateReminderDto,
} from './dto/reminder.dto';
import { generateOccurrences } from './occurrence-generator';
import { canDelete, canEdit, type ReminderKind } from './reminder-policy';

export interface ScheduleInput {
  localTime: string;
  daysOfWeek: number[];
  timeZone?: string;
  validFrom: string;
  validTo?: string | null;
}

export interface ReminderView {
  id: string;
  profileId: string;
  kind: ReminderKind;
  title: string;
  notes: string | null;
  author: { accountId: string; relation: Relation; displayName: string };
  status: 'active' | 'inactive';
  version: number;
  schedules: Array<ScheduleInput & { id: string; status: string }>;
  permissions: { canEdit: boolean; canDelete: boolean };
}

interface ReminderRow {
  id: string;
  profile_id: string;
  kind: ReminderKind;
  title: string;
  notes: string | null;
  author_account_id: string;
  author_relation: Relation;
  author_name: string | null;
  status: 'active' | 'inactive';
  version: number;
  time_zone: string;
}

@Injectable()
export class RemindersService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockPort,
    private readonly policy: PolicyConfig,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly sync: SyncSignalService,
  ) {}

  list(
    principal: Principal,
    profileId: string,
    query: { includeInactive?: boolean },
  ): Promise<ReminderView[]> {
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const access = await this.access.requireAccess(tx, profileId);
      const rows = await tx.$queryRaw<ReminderRow[]>`
        SELECT
          r.id, r.profile_id, r.kind, r.title, r.notes, r.author_account_id,
          r.author_relation, a.display_name AS author_name, r.status, r.version,
          p.time_zone
        FROM guardme.reminders r
        JOIN guardme.profiles p ON p.id = r.profile_id
        LEFT JOIN guardme.accounts a ON a.id = r.author_account_id
        WHERE r.profile_id = ${profileId}::uuid
          AND (${query.includeInactive ?? false} OR r.status = 'active')
        ORDER BY r.created_at, r.id
      `;
      return Promise.all(
        rows.map((row) => this.toView(tx, row, access.relation)),
      );
    });
  }

  create(
    principal: Principal,
    profileId: string,
    input: CreateReminderDto,
  ): Promise<ReminderView> {
    if (!principal.accountId) throw new DomainError('ACCOUNT_NOT_BOOTSTRAPPED');
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const access = await this.access.requireAccess(tx, profileId);
      const zone = await this.profileZone(tx, profileId);
      const inserted = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO guardme.reminders (
          profile_id, kind, title, notes, author_account_id, author_relation
        )
        VALUES (
          ${profileId}::uuid,
          ${input.kind},
          ${input.title},
          ${input.notes ?? null},
          ${principal.accountId}::uuid,
          ${access.relation}
        )
        RETURNING id
      `;
      const id = inserted[0]?.id;
      if (!id) throw new DomainError('NOT_FOUND');
      const now = this.clock.now();
      const until = this.horizon(now);
      for (const schedule of input.schedules) {
        await this.insertSchedule(tx, id, schedule, zone, now, until);
      }
      await this.sync.requestSyncSignal(tx, profileId, 'changes');
      await this.audit.record(tx, {
        operation: 'reminder.create',
        result: 'ok',
        profileId,
        actorAccountId: principal.accountId,
        actorKind: 'account',
        details: { reminderId: id, kind: input.kind },
      });
      return this.loadView(tx, id, access.relation);
    });
  }

  update(
    principal: Principal,
    reminderId: string,
    input: UpdateReminderDto,
  ): Promise<ReminderView> {
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const current = await this.lock(tx, reminderId);
      const access = await this.access.requireAccess(tx, current.profile_id);
      if (
        canEdit(
          access.relation,
          current.author_relation,
          this.policy.userCanEditCaregiverReminders,
        ) === 'not_defined'
      ) {
        throw new DomainError('CAPABILITY_NOT_ENABLED', undefined, {
          policy: 'PD-08',
        });
      }
      if (input.expectedVersion !== current.version) {
        throw new DomainError('VERSION_CONFLICT', undefined, {
          current: { version: current.version },
        });
      }
      if (input.title != null || input.notes !== undefined) {
        await tx.$executeRaw`
          UPDATE guardme.reminders
          SET title = COALESCE(${input.title ?? null}, title),
              notes = CASE
                WHEN ${input.notes !== undefined} THEN ${input.notes ?? null}
                ELSE notes
              END
          WHERE id = ${reminderId}::uuid
        `;
      } else {
        await tx.$executeRaw`
          UPDATE guardme.reminders SET title = title WHERE id = ${reminderId}::uuid
        `;
      }
      if (input.schedules) {
        const now = this.clock.now();
        await this.replaceSchedules(tx, current, input.schedules, now);
      }
      await this.sync.requestSyncSignal(tx, current.profile_id, 'changes');
      await this.audit.record(tx, {
        operation: 'reminder.update',
        result: 'ok',
        profileId: current.profile_id,
        actorAccountId: principal.accountId,
        actorKind: 'account',
        details: { reminderId },
      });
      return this.loadView(tx, reminderId, access.relation);
    });
  }

  async deactivate(
    principal: Principal,
    reminderId: string,
    expectedVersion: number,
  ): Promise<void> {
    const decision = await this.db.asAccount(
      toAccountContext(principal),
      async (tx) => {
        const current = await this.lock(tx, reminderId);
        const access = await this.access.requireAccess(tx, current.profile_id);
        if (!canDelete(access.relation, current.author_relation)) {
          await this.audit.record(tx, {
            operation: 'reminder.delete',
            result: 'denied',
            profileId: current.profile_id,
            actorAccountId: principal.accountId,
            actorKind: 'account',
            details: { reminderId, reason: 'caregiver_authored' },
          });
          return { allowed: false as const };
        }
        return { allowed: true as const };
      },
    );
    if (!decision.allowed) {
      throw new DomainError('FORBIDDEN_ACTION', undefined, {
        reason: 'caregiver_authored',
      });
    }
    await this.db.asAccount(toAccountContext(principal), async (tx) => {
      const current = await this.lock(tx, reminderId);
      if (expectedVersion !== current.version) {
        throw new DomainError('VERSION_CONFLICT', undefined, {
          current: { version: current.version },
        });
      }
      const now = this.clock.now();
      await tx.$executeRaw`
        UPDATE guardme.reminders
        SET status = 'inactive',
            deactivated_at = ${now}::timestamptz,
            deactivated_by_account_id = ${principal.accountId}::uuid
        WHERE id = ${reminderId}::uuid
      `;
      await tx.$executeRaw`
        UPDATE guardme.reminder_occurrences
        SET status = 'canceled', cancel_reason = 'reminder_deactivated'
        WHERE reminder_id = ${reminderId}::uuid
          AND status IN ('scheduled', 'postponed')
          AND scheduled_for > ${now}::timestamptz
      `;
      await this.sync.requestSyncSignal(tx, current.profile_id, 'changes');
      await this.audit.record(tx, {
        operation: 'reminder.delete',
        result: 'ok',
        profileId: current.profile_id,
        actorAccountId: principal.accountId,
        actorKind: 'account',
        details: { reminderId },
      });
    });
  }

  private async replaceSchedules(
    tx: Tx,
    reminder: ReminderRow,
    schedules: ScheduleDto[],
    now: Date,
  ): Promise<void> {
    const active = await tx.$queryRaw<Array<{ id: string; time_zone: string }>>`
      SELECT id, time_zone
      FROM guardme.reminder_schedules
      WHERE reminder_id = ${reminder.id}::uuid
        AND status = 'active'
    `;
    for (const schedule of active) {
      const today = DateTime.fromJSDate(now, {
        zone: schedule.time_zone,
      }).toISODate();
      await tx.$executeRaw`
        UPDATE guardme.reminder_schedules
        SET status = 'ended', valid_to = ${today}::date
        WHERE id = ${schedule.id}::uuid
      `;
    }
    await tx.$executeRaw`
      UPDATE guardme.reminder_occurrences
      SET status = 'canceled', cancel_reason = 'schedule_changed'
      WHERE reminder_id = ${reminder.id}::uuid
        AND status IN ('scheduled', 'postponed')
        AND scheduled_for > ${now}::timestamptz
    `;
    const until = this.horizon(now);
    for (const schedule of schedules) {
      await this.insertSchedule(
        tx,
        reminder.id,
        schedule,
        reminder.time_zone,
        now,
        until,
      );
    }
  }

  private async insertSchedule(
    tx: Tx,
    reminderId: string,
    schedule: ScheduleDto,
    profileZone: string,
    now: Date,
    until: Date,
  ): Promise<void> {
    if (schedule.validTo && schedule.validTo < schedule.validFrom) {
      throw new DomainError('VALIDATION_FAILED', 'Validación fallida', {
        fields: [{ field: 'validTo', messages: ['Anterior a validFrom'] }],
      });
    }
    const zone = schedule.timeZone ?? profileZone;
    const days = Prisma.sql`ARRAY[${Prisma.join(schedule.daysOfWeek)}]::smallint[]`;
    const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO guardme.reminder_schedules (
        reminder_id, local_time, days_of_week, time_zone, valid_from, valid_to
      )
      VALUES (
        ${reminderId}::uuid,
        ${schedule.localTime}::time,
        ${days},
        ${zone},
        ${schedule.validFrom}::date,
        ${schedule.validTo ?? null}::date
      )
      RETURNING id
    `;
    const id = inserted[0]?.id;
    if (!id) return;
    const instants = generateOccurrences(
      {
        id,
        localTime: schedule.localTime,
        daysOfWeek: schedule.daysOfWeek,
        timeZone: zone,
        validFrom: schedule.validFrom,
        validTo: schedule.validTo ?? null,
      },
      now,
      until,
    );
    await insertOccurrences(tx, reminderId, id, instants);
  }

  private horizon(now: Date): Date {
    return new Date(
      now.getTime() + this.policy.occurrenceHorizonDays * 86_400_000,
    );
  }

  private async profileZone(tx: Tx, profileId: string): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ time_zone: string }>>`
      SELECT time_zone FROM guardme.profiles WHERE id = ${profileId}::uuid
    `;
    return rows[0]?.time_zone ?? this.policy.defaultProfileTimeZone;
  }

  private async lock(tx: Tx, reminderId: string): Promise<ReminderRow> {
    const rows = await tx.$queryRaw<ReminderRow[]>`
      SELECT
        r.id, r.profile_id, r.kind, r.title, r.notes, r.author_account_id,
        r.author_relation, a.display_name AS author_name, r.status, r.version,
        p.time_zone
      FROM guardme.reminders r
      JOIN guardme.profiles p ON p.id = r.profile_id
      LEFT JOIN guardme.accounts a ON a.id = r.author_account_id
      WHERE r.id = ${reminderId}::uuid
      FOR UPDATE OF r
    `;
    const row = rows[0];
    if (!row) throw new DomainError('NOT_FOUND');
    return row;
  }

  private async loadView(
    tx: Tx,
    reminderId: string,
    relation: Relation,
  ): Promise<ReminderView> {
    const rows = await tx.$queryRaw<ReminderRow[]>`
      SELECT
        r.id, r.profile_id, r.kind, r.title, r.notes, r.author_account_id,
        r.author_relation, a.display_name AS author_name, r.status, r.version,
        p.time_zone
      FROM guardme.reminders r
      JOIN guardme.profiles p ON p.id = r.profile_id
      LEFT JOIN guardme.accounts a ON a.id = r.author_account_id
      WHERE r.id = ${reminderId}::uuid
    `;
    const row = rows[0];
    if (!row) throw new DomainError('NOT_FOUND');
    return this.toView(tx, row, relation);
  }

  private async toView(
    tx: Tx,
    row: ReminderRow,
    relation: Relation,
  ): Promise<ReminderView> {
    const schedules = await tx.$queryRaw<
      Array<{
        id: string;
        local_time: string;
        days_of_week: number[];
        time_zone: string;
        valid_from: string;
        valid_to: string | null;
        status: string;
      }>
    >`
      SELECT
        id, local_time::text AS local_time, days_of_week, time_zone,
        valid_from::text AS valid_from, valid_to::text AS valid_to, status
      FROM guardme.reminder_schedules
      WHERE reminder_id = ${row.id}::uuid
      ORDER BY created_at, id
    `;
    return {
      id: row.id,
      profileId: row.profile_id,
      kind: row.kind,
      title: row.title,
      notes: row.notes,
      author: {
        accountId: row.author_account_id,
        relation: row.author_relation,
        displayName: row.author_name ?? '',
      },
      status: row.status,
      version: row.version,
      schedules: schedules.map((schedule) => ({
        id: schedule.id,
        status: schedule.status,
        localTime: schedule.local_time.slice(0, 5),
        daysOfWeek: schedule.days_of_week,
        timeZone: schedule.time_zone,
        validFrom: schedule.valid_from,
        validTo: schedule.valid_to,
      })),
      permissions: {
        canEdit:
          canEdit(
            relation,
            row.author_relation,
            this.policy.userCanEditCaregiverReminders,
          ) === 'allowed',
        canDelete: canDelete(relation, row.author_relation),
      },
    };
  }
}

export async function insertOccurrences(
  tx: Tx,
  reminderId: string,
  scheduleId: string,
  instants: Date[],
): Promise<void> {
  for (const instant of instants) {
    await tx.$executeRaw`
      INSERT INTO guardme.reminder_occurrences (
        reminder_id, schedule_id, scheduled_for
      )
      VALUES (
        ${reminderId}::uuid,
        ${scheduleId}::uuid,
        ${instant}::timestamptz
      )
      ON CONFLICT (schedule_id, scheduled_for) DO NOTHING
    `;
  }
}
