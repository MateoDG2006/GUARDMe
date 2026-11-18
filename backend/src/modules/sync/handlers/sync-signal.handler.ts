import { Injectable } from '@nestjs/common';
import { DbService, type Tx } from '../../../infra/db/db.service';
import { PushPort } from '../../../infra/push/push.port';
import {
  type ActionHandler,
  type HandlerResult,
  type PendingActionRow,
} from '../../pending-actions/action-handler';

@Injectable()
export class SyncSignalHandler implements ActionHandler {
  readonly types = ['SYNC_SIGNAL'] as const;

  constructor(
    private readonly db: DbService,
    private readonly push: PushPort,
  ) {}

  handle(action: PendingActionRow): Promise<HandlerResult> {
    return this.db.asWorker((tx) => this.apply(tx, action));
  }

  private async apply(
    tx: Tx,
    action: PendingActionRow,
  ): Promise<HandlerResult> {
    const kind =
      action.payload.kind === 'location_refresh'
        ? 'location_refresh'
        : 'changes';
    const targets = await tx.$queryRaw<
      Array<{ push_token: string; id: string }>
    >`
      SELECT DISTINCT i.id, i.push_token
      FROM guardme.installations i
      JOIN guardme.profile_access a ON a.account_id = i.account_id
      WHERE a.profile_id = ${action.resourceId}::uuid
        AND a.status = 'active'
        AND i.status = 'active'
        AND i.push_token IS NOT NULL
        AND (${kind} = 'changes' OR a.relation = 'user')
    `;
    let retry: string | null = null;
    for (const target of targets) {
      const result = await this.push.send({
        token: target.push_token,
        notificationId: action.id,
        type: 'sync',
        priority: 'normal',
        ttlSeconds: 300,
        collapseKey: `sync:${action.resourceId}:${kind}`,
        data: {
          type: 'sync',
          kind,
          profileId: action.resourceId,
        },
      });
      if (result.status === 'token_invalid') {
        await tx.$executeRaw`
          UPDATE guardme.installations
          SET push_token = NULL
          WHERE id = ${target.id}::uuid
        `;
      } else if (result.status === 'retryable' || result.status === 'failed') {
        retry = result.error;
      }
    }
    if (retry) return { outcome: 'retry', error: retry };
    return { outcome: 'done' };
  }
}
