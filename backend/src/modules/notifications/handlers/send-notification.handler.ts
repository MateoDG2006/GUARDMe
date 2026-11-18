import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClockPort } from '../../../infra/clock/clock.port';
import { DbService, type Tx } from '../../../infra/db/db.service';
import {
  PushPort,
  type NotificationType,
  type PushResult,
} from '../../../infra/push/push.port';
import {
  type ActionHandler,
  type HandlerResult,
  type PendingActionRow,
} from '../../pending-actions/action-handler';
import { notificationText } from '../notification-texts';

interface Notice {
  id: string;
  type: NotificationType;
  profile_id: string;
  recipient_account_id: string;
  resource_type: string;
  resource_id: string;
  resource_version: number;
  status: string;
  expires_at: Date;
  priority: string;
}

@Injectable()
export class SendNotificationHandler implements ActionHandler {
  readonly types = ['SEND_NOTIFICATION'] as const;
  private readonly logger = new Logger(SendNotificationHandler.name);

  constructor(
    private readonly db: DbService,
    private readonly clock: ClockPort,
    private readonly config: ConfigService,
    private readonly push: PushPort,
  ) {}

  async handle(action: PendingActionRow): Promise<HandlerResult> {
    const prepared = await this.db.asWorker((tx) => this.prepare(tx, action));
    if (prepared.outcome !== 'ready') return prepared.result;
    let retryable: string | null = null;
    for (const target of prepared.targets) {
      const result = await this.push.send({
        token: target.token,
        notificationId: prepared.notice.id,
        type: prepared.notice.type,
        priority: prepared.notice.priority === 'urgent' ? 'high' : 'normal',
        ttlSeconds: Math.max(
          0,
          Math.floor(
            (prepared.notice.expires_at.getTime() -
              this.clock.now().getTime()) /
              1000,
          ),
        ),
        collapseKey: prepared.notice.resource_id,
        ...notificationText(prepared.notice.type),
        data: {
          notificationId: prepared.notice.id,
          type: prepared.notice.type,
          resourceType: prepared.notice.resource_type,
          resourceId: prepared.notice.resource_id,
          resourceVersion: String(prepared.notice.resource_version),
          profileId: prepared.notice.profile_id,
        },
      });
      await this.db.asWorker((tx) => this.record(tx, target, result));
      if (
        result.status === 'accepted' &&
        prepared.notice.resource_type === 'incident'
      ) {
        const incidents = await this.db.asWorker((tx) => {
          return tx.$queryRaw<Array<{ received_at: Date }>>`
            SELECT received_at
            FROM guardme.incidents
            WHERE id = ${prepared.notice.resource_id}::uuid
          `;
        });
        const receivedAt = incidents[0]?.received_at;
        if (receivedAt) {
          this.logger.log({
            'metric.notification_latency_ms':
              this.clock.now().getTime() - receivedAt.getTime(),
          });
        }
      }
      if (result.status === 'retryable') retryable = result.error;
    }
    if (retryable) return { outcome: 'retry', error: retryable };
    await this.db.asWorker((tx) => {
      return tx.$executeRaw`
        UPDATE guardme.notifications
        SET status = 'dispatched'
        WHERE id = ${prepared.notice.id}::uuid
          AND status = 'pending'
      `;
    });
    return { outcome: 'done' };
  }

  private async prepare(
    tx: Tx,
    action: PendingActionRow,
  ): Promise<
    | { outcome: 'stop'; result: HandlerResult }
    | {
        outcome: 'ready';
        notice: Notice;
        targets: Array<{
          deliveryId: string;
          installationId: string;
          token: string;
        }>;
      }
  > {
    const now = this.clock.now();
    const rows = await tx.$queryRaw<Notice[]>`
      SELECT
        id, type, profile_id, recipient_account_id, resource_type, resource_id,
        resource_version, status, expires_at, priority
      FROM guardme.notifications
      WHERE id = ${action.resourceId}::uuid
    `;
    const notice = rows[0];
    if (!notice)
      return stop({ outcome: 'discarded', reason: 'missing_notification' });
    if (notice.status === 'expired' || notice.status === 'discarded') {
      return stop({ outcome: 'discarded', reason: notice.status });
    }
    if (notice.expires_at.getTime() < now.getTime()) {
      await tx.$executeRaw`
        UPDATE guardme.notifications
        SET status = 'expired'
        WHERE id = ${notice.id}::uuid
      `;
      return stop({ outcome: 'discarded', reason: 'expired' });
    }
    const access = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM guardme.profile_access
      WHERE profile_id = ${notice.profile_id}::uuid
        AND account_id = ${notice.recipient_account_id}::uuid
        AND status = 'active'
    `;
    if (!access[0]) {
      await tx.$executeRaw`
        UPDATE guardme.notifications
        SET status = 'discarded'
        WHERE id = ${notice.id}::uuid
      `;
      return stop({ outcome: 'discarded', reason: 'access_revoked' });
    }
    const installations = await tx.$queryRaw<
      Array<{ id: string; push_token: string }>
    >`
      SELECT id, push_token
      FROM guardme.installations
      WHERE account_id = ${notice.recipient_account_id}::uuid
        AND status = 'active'
        AND push_token IS NOT NULL
    `;
    if (installations.length === 0) {
      await tx.$executeRaw`
        UPDATE guardme.notifications
        SET status = 'no_destination'
        WHERE id = ${notice.id}::uuid
      `;
      return stop({ outcome: 'done' });
    }
    const channel = this.config.getOrThrow<string>('PUSH_PROVIDER');
    const targets: Array<{
      deliveryId: string;
      installationId: string;
      token: string;
    }> = [];
    for (const installation of installations) {
      const inserted = await tx.$queryRaw<
        Array<{ id: string; status: string }>
      >`
        INSERT INTO guardme.notification_deliveries (
          notification_id, installation_id, channel, status
        )
        VALUES (
          ${notice.id}::uuid,
          ${installation.id}::uuid,
          ${channel},
          'pending'
        )
        ON CONFLICT (notification_id, installation_id) DO NOTHING
        RETURNING id, status
      `;
      const delivery =
        inserted[0] ??
        (
          await tx.$queryRaw<Array<{ id: string; status: string }>>`
            SELECT id, status
            FROM guardme.notification_deliveries
            WHERE notification_id = ${notice.id}::uuid
              AND installation_id = ${installation.id}::uuid
          `
        )[0];
      if (!delivery || delivery.status === 'accepted') continue;
      targets.push({
        deliveryId: delivery.id,
        installationId: installation.id,
        token: installation.push_token,
      });
    }
    return { outcome: 'ready', notice, targets };
  }

  private async record(
    tx: Tx,
    target: { deliveryId: string; installationId: string },
    result: PushResult,
  ): Promise<void> {
    const now = this.clock.now();
    if (result.status === 'accepted') {
      await tx.$executeRaw`
        UPDATE guardme.notification_deliveries
        SET status = 'accepted',
            provider_ref = ${result.providerRef},
            accepted_at = ${now}::timestamptz,
            attempts = attempts + 1,
            error_code = NULL
        WHERE id = ${target.deliveryId}::uuid
      `;
      return;
    }
    if (result.status === 'token_invalid') {
      await tx.$executeRaw`
        UPDATE guardme.installations
        SET push_token = NULL
        WHERE id = ${target.installationId}::uuid
      `;
    }
    const status = result.status === 'retryable' ? 'pending' : result.status;
    const errorCode =
      result.status === 'token_invalid' ? 'token_invalid' : result.error;
    await tx.$executeRaw`
      UPDATE guardme.notification_deliveries
      SET status = ${status},
          attempts = attempts + 1,
          error_code = ${errorCode}
      WHERE id = ${target.deliveryId}::uuid
    `;
  }
}

function stop(result: HandlerResult): {
  outcome: 'stop';
  result: HandlerResult;
} {
  return { outcome: 'stop', result };
}
