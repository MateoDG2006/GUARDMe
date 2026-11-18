import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { PolicyConfig } from '../../config/policy.config';
import { ClockPort } from '../../infra/clock/clock.port';
import { DbService, type Tx } from '../../infra/db/db.service';
import { AuditService } from '../audit/audit.service';
import { toAccountContext, type Principal } from '../identity/principal';
import { AccessService } from '../profiles/access.service';
import type { RespondOccurrenceDto } from './dto/reminder.dto';
import {
  allowedResponses,
  canRespond,
  type ReminderKind,
} from './reminder-policy';

export interface OccurrenceView {
  id: string;
  reminderId: string;
  kind: string;
  title: string;
  scheduledFor: string;
  status: string;
  postponedUntil: string | null;
  respondedAt: string | null;
  respondedBy: string | null;
  version: number;
}

const TERMINAL = new Set(['taken', 'skipped', 'acknowledged', 'canceled']);

interface OccurrenceRow {
  id: string;
  reminder_id: string;
  profile_id: string;
  kind: ReminderKind;
  title: string;
  scheduled_for: Date;
  status: string;
  postponed_until: Date | null;
  responded_at: Date | null;
  responded_by_account_id: string | null;
  version: number;
}

@Injectable()
export class OccurrencesService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockPort,
    private readonly policy: PolicyConfig,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  window(
    principal: Principal,
    profileId: string,
    query: { from: string; to: string },
  ): Promise<OccurrenceView[]> {
    const from = parseInstant(query.from, 'from');
    const to = parseInstant(query.to, 'to');
    if (to.getTime() < from.getTime()) {
      throw new DomainError('VALIDATION_FAILED', 'Validación fallida', {
        fields: [{ field: 'to', messages: ['Anterior a from'] }],
      });
    }
    if (to.getTime() - from.getTime() > 14 * 86_400_000) {
      throw new DomainError('VALIDATION_FAILED', 'Validación fallida', {
        fields: [{ field: 'to', messages: ['La ventana máxima es 14 días'] }],
      });
    }
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      await this.access.requireAccess(tx, profileId);
      const rows = await tx.$queryRaw<OccurrenceRow[]>`
        SELECT
          o.id, o.reminder_id, r.profile_id, r.kind, r.title, o.scheduled_for,
          o.status, o.postponed_until, o.responded_at, o.responded_by_account_id,
          o.version
        FROM guardme.reminder_occurrences o
        JOIN guardme.reminders r ON r.id = o.reminder_id
        WHERE r.profile_id = ${profileId}::uuid
          AND o.scheduled_for >= ${from}::timestamptz
          AND o.scheduled_for < ${to}::timestamptz
        ORDER BY o.scheduled_for, o.id
      `;
      return rows.map(toView);
    });
  }

  respond(
    principal: Principal,
    occurrenceId: string,
    input: RespondOccurrenceDto,
  ): Promise<OccurrenceView> {
    if (!principal.accountId) throw new DomainError('ACCOUNT_NOT_BOOTSTRAPPED');
    if (!principal.installationId)
      throw new DomainError('INSTALLATION_MISMATCH');
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const current = await this.lock(tx, occurrenceId);
      const access = await this.access.requireAccess(tx, current.profile_id);
      if (canRespond(access.relation) === 'not_defined') {
        throw new DomainError('CAPABILITY_NOT_ENABLED', undefined, {
          policy: 'PD-08',
        });
      }
      if (!allowedResponses(current.kind).includes(input.response)) {
        throw new DomainError('VALIDATION_FAILED', 'Validación fallida', {
          fields: [{ field: 'response', messages: ['Respuesta no permitida'] }],
        });
      }
      if (TERMINAL.has(current.status)) {
        if (current.status === input.response) return toView(current);
        throw new DomainError('INCOMPATIBLE_STATE', undefined, {
          current: { status: current.status, version: current.version },
        });
      }
      if (
        current.status === 'postponed' &&
        !['taken', 'skipped', 'acknowledged', 'postponed'].includes(
          input.response,
        )
      ) {
        throw new DomainError('INCOMPATIBLE_STATE');
      }
      if (input.expectedVersion !== current.version) {
        throw new DomainError('VERSION_CONFLICT', undefined, {
          current: { version: current.version },
        });
      }
      const now = this.clock.now();
      const postponedUntil =
        input.response === 'postponed'
          ? new Date(now.getTime() + this.policy.occurrenceSnoozeSec * 1000)
          : null;
      await tx.$executeRaw`
        UPDATE guardme.reminder_occurrences
        SET status = ${input.response},
            postponed_until = ${postponedUntil}::timestamptz,
            responded_by_account_id = ${principal.accountId}::uuid,
            responded_at = ${now}::timestamptz,
            response_installation_id = ${principal.installationId}::uuid
        WHERE id = ${occurrenceId}::uuid
      `;
      await this.audit.record(tx, {
        operation: 'occurrence.respond',
        result: 'ok',
        profileId: current.profile_id,
        actorAccountId: principal.accountId,
        actorKind: 'account',
        details: { occurrenceId, response: input.response },
      });
      return toView({
        ...current,
        status: input.response,
        postponed_until: postponedUntil,
        responded_at: now,
        responded_by_account_id: principal.accountId,
        version: current.version + 1,
      });
    });
  }

  private async lock(tx: Tx, occurrenceId: string): Promise<OccurrenceRow> {
    const rows = await tx.$queryRaw<OccurrenceRow[]>`
      SELECT
        o.id, o.reminder_id, r.profile_id, r.kind, r.title, o.scheduled_for,
        o.status, o.postponed_until, o.responded_at, o.responded_by_account_id,
        o.version
      FROM guardme.reminder_occurrences o
      JOIN guardme.reminders r ON r.id = o.reminder_id
      WHERE o.id = ${occurrenceId}::uuid
      FOR UPDATE OF o
    `;
    const row = rows[0];
    if (!row) throw new DomainError('NOT_FOUND');
    return row;
  }
}

function toView(row: OccurrenceRow): OccurrenceView {
  return {
    id: row.id,
    reminderId: row.reminder_id,
    kind: row.kind,
    title: row.title,
    scheduledFor: row.scheduled_for.toISOString(),
    status: row.status,
    postponedUntil: row.postponed_until?.toISOString() ?? null,
    respondedAt: row.responded_at?.toISOString() ?? null,
    respondedBy: row.responded_by_account_id,
    version: row.version,
  };
}

function parseInstant(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new DomainError('VALIDATION_FAILED', 'Validación fallida', {
      fields: [{ field, messages: ['Fecha inválida'] }],
    });
  }
  return date;
}
