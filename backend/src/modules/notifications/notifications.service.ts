import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { ClockPort } from '../../infra/clock/clock.port';
import { DbService, type Tx } from '../../infra/db/db.service';
import {
  type NotificationPriority,
  type NotificationType,
} from '../../infra/push/push.port';
import { toAccountContext, type Principal } from '../identity/principal';
import { PendingActionsService } from '../pending-actions/pending-actions.service';

export interface NotificationView {
  id: string;
  type: NotificationType;
  profileId: string;
  resourceType: string;
  resourceId: string;
  resourceVersion: number;
  status: string;
  createdAt: string;
  expiresAt: string;
  myDelivery: {
    acceptedAt: string | null;
    receivedAt: string | null;
    openedAt: string | null;
  } | null;
}

export interface DeliveryEvidenceView {
  acceptedAt: string | null;
  receivedAt: string | null;
  openedAt: string | null;
}

export interface RecipientEvidenceView {
  recipientAccountId: string;
  displayName: string;
  status: string;
  acceptedAt: string | null;
  receivedAt: string | null;
  openedAt: string | null;
}

export interface CreateNotificationsInput {
  type: NotificationType;
  profileId: string;
  recipientAccountIds: string[];
  resourceType: string;
  resourceId: string;
  resourceVersion: number;
  dedupeScope: string;
  priority: NotificationPriority;
  expiresAt: Date;
}

interface NotificationRow {
  id: string;
  type: NotificationType;
  profile_id: string;
  resource_type: string;
  resource_id: string;
  resource_version: number;
  status: string;
  created_at: Date;
  expires_at: Date;
  accepted_at: Date | null;
  received_at: Date | null;
  opened_at: Date | null;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockPort,
    private readonly pending: PendingActionsService,
  ) {}

  async createForRecipients(
    tx: Tx,
    input: CreateNotificationsInput,
  ): Promise<string[]> {
    const created: string[] = [];
    for (const accountId of input.recipientAccountIds) {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO guardme.notifications (
          type, profile_id, recipient_account_id, resource_type, resource_id,
          resource_version, dedupe_key, priority, expires_at
        )
        VALUES (
          ${input.type},
          ${input.profileId}::uuid,
          ${accountId}::uuid,
          ${input.resourceType},
          ${input.resourceId}::uuid,
          ${input.resourceVersion}::int,
          ${`${input.dedupeScope}:${accountId}`},
          ${input.priority},
          ${input.expiresAt}::timestamptz
        )
        ON CONFLICT (dedupe_key) DO NOTHING
        RETURNING id
      `;
      const id = rows[0]?.id;
      if (!id) continue;
      created.push(id);
      await this.pending.enqueue(tx, {
        type: 'SEND_NOTIFICATION',
        resourceType: 'notification',
        resourceId: id,
        dedupeKey: `send:${id}`,
        runAt: this.clock.now(),
      });
    }
    return created;
  }

  listMine(
    principal: Principal,
    query: { cursor?: string; limit?: number },
  ): Promise<{ items: NotificationView[]; nextCursor: string | null }> {
    if (!principal.accountId) throw new DomainError('ACCOUNT_NOT_BOOTSTRAPPED');
    const limit = query.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new DomainError('VALIDATION_FAILED', 'Validación fallida', {
        fields: [{ field: 'limit', messages: ['Entre 1 y 50'] }],
      });
    }
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const rows = await tx.$queryRaw<NotificationRow[]>`
        SELECT
          n.id, n.type, n.profile_id, n.resource_type, n.resource_id,
          n.resource_version, n.status, n.created_at, n.expires_at,
          d.accepted_at, d.received_at, d.opened_at
        FROM guardme.notifications n
        LEFT JOIN guardme.notification_deliveries d
          ON d.notification_id = n.id
         AND d.installation_id = ${principal.installationId}::uuid
        WHERE n.recipient_account_id = ${principal.accountId}::uuid
          AND (
            ${cursor?.at ?? null}::timestamptz IS NULL
            OR n.created_at < ${cursor?.at ?? null}::timestamptz
            OR (
              n.created_at = ${cursor?.at ?? null}::timestamptz
              AND n.id < ${cursor?.id ?? null}::uuid
            )
          )
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT ${limit + 1}::int
      `;
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map(toView),
        nextCursor:
          rows.length > limit && last
            ? encodeCursor({ at: last.created_at.toISOString(), id: last.id })
            : null,
      };
    });
  }

  acknowledge(
    principal: Principal,
    notificationId: string,
    kind: 'received' | 'opened',
  ): Promise<DeliveryEvidenceView> {
    if (!principal.installationId) {
      throw new DomainError('INSTALLATION_MISMATCH');
    }
    const now = this.clock.now();
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          accepted_at: Date | null;
          received_at: Date | null;
          opened_at: Date | null;
        }>
      >`
        UPDATE guardme.notification_deliveries
        SET received_at = CASE
              WHEN received_at IS NULL THEN ${now}::timestamptz
              ELSE received_at
            END,
            opened_at = CASE
              WHEN ${kind} = 'opened' AND opened_at IS NULL THEN ${now}::timestamptz
              ELSE opened_at
            END
        WHERE notification_id = ${notificationId}::uuid
          AND installation_id = ${principal.installationId}::uuid
        RETURNING accepted_at, received_at, opened_at
      `;
      const row = rows[0];
      if (!row) throw new DomainError('NOT_FOUND');
      return {
        acceptedAt: iso(row.accepted_at),
        receivedAt: iso(row.received_at),
        openedAt: iso(row.opened_at),
      };
    });
  }

  async evidenceForResource(
    tx: Tx,
    resourceType: string,
    resourceId: string,
  ): Promise<RecipientEvidenceView[]> {
    const rows = await tx.$queryRaw<
      Array<{
        recipient_account_id: string;
        display_name: string;
        status: string;
        accepted_at: Date | null;
        received_at: Date | null;
        opened_at: Date | null;
      }>
    >`
      SELECT
        n.recipient_account_id,
        a.display_name,
        n.status,
        min(d.accepted_at) AS accepted_at,
        min(d.received_at) AS received_at,
        min(d.opened_at) AS opened_at
      FROM guardme.notifications n
      JOIN guardme.accounts a ON a.id = n.recipient_account_id
      LEFT JOIN guardme.notification_deliveries d ON d.notification_id = n.id
      WHERE n.resource_type = ${resourceType}
        AND n.resource_id = ${resourceId}::uuid
      GROUP BY n.recipient_account_id, a.display_name, n.status, n.created_at
      ORDER BY n.created_at
    `;
    return rows.map((row) => ({
      recipientAccountId: row.recipient_account_id,
      displayName: row.display_name,
      status: row.status,
      acceptedAt: iso(row.accepted_at),
      receivedAt: iso(row.received_at),
      openedAt: iso(row.opened_at),
    }));
  }
}

function toView(row: NotificationRow): NotificationView {
  const hasDelivery =
    row.accepted_at != null || row.received_at != null || row.opened_at != null;
  return {
    id: row.id,
    type: row.type,
    profileId: row.profile_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    resourceVersion: row.resource_version,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    myDelivery: hasDelivery
      ? {
          acceptedAt: iso(row.accepted_at),
          receivedAt: iso(row.received_at),
          openedAt: iso(row.opened_at),
        }
      : null,
  };
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
