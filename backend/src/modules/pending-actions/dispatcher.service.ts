import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type PgBoss from 'pg-boss';
import { PG_BOSS } from '../../infra/queue/pgboss.provider';
import { ClockPort } from '../../infra/clock/clock.port';
import { DbService } from '../../infra/db/db.service';
import {
  ACTION_HANDLERS,
  CALL_QUEUES,
  retryDelaySec,
  terminalFailure,
  type ActionHandler,
  type HandlerResult,
  type PendingActionRow,
} from './action-handler';
import { PENDING_ACTION_TYPES, type PendingActionType } from './queues';

interface ClaimedRow {
  id: string;
  type: PendingActionType;
  resource_type: string;
  resource_id: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  run_at: Date;
}

@Injectable()
export class DispatcherService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DispatcherService.name);

  constructor(
    private readonly db: DbService,
    private readonly clock: ClockPort,
    private readonly config: ConfigService,
    @Inject(PG_BOSS) private readonly boss: PgBoss,
    @Inject(ACTION_HANDLERS) private readonly handlers: ActionHandler[],
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const concurrency = this.config.getOrThrow<number>('WORKER_CONCURRENCY');
    for (const type of PENDING_ACTION_TYPES) {
      await this.boss.createQueue(type).catch(() => undefined);
      const batchSize = CALL_QUEUES.has(type) ? 1 : concurrency;
      await this.boss.work<{ actionId: string }>(
        type,
        { batchSize },
        async (jobs) => {
          await Promise.all(jobs.map((job) => this.runOne(job.data.actionId)));
        },
      );
    }
  }

  async runOne(actionId: string): Promise<void> {
    const claimed = await this.claim(actionId);
    if (!claimed) return;
    const handler = this.handlers.find((item) =>
      item.types.includes(claimed.type),
    );
    let result: HandlerResult;
    if (!handler) {
      result = { outcome: 'failed', error: 'no_handler' };
    } else {
      result = await this.runHandler(handler, claimed);
    }
    result = terminalFailure(result, claimed.attempts, claimed.maxAttempts);
    await this.apply(claimed, result);
    if (result.outcome === 'failed') {
      this.logger.error({
        actionId: claimed.id,
        type: claimed.type,
        resourceId: claimed.resourceId,
        correlationId: claimed.payload.correlationId ?? null,
        error: result.error,
      });
    }
  }

  private async claim(actionId: string): Promise<PendingActionRow | null> {
    const now = this.clock.now();
    const lease = new Date(
      now.getTime() + this.config.getOrThrow<number>('ACTION_LEASE_SEC') * 1000,
    );
    const rows = await this.db.asWorker((tx) => {
      return tx.$queryRaw<ClaimedRow[]>`
        UPDATE guardme.pending_actions
        SET status = 'running',
            attempts = attempts + 1,
            lease_until = ${lease}::timestamptz
        WHERE id = ${actionId}::uuid
          AND status = 'dispatched'
        RETURNING
          id, type, resource_type, resource_id, payload,
          attempts, max_attempts, run_at
      `;
    });
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      type: row.type,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      payload: row.payload ?? {},
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      runAt: row.run_at,
    };
  }

  private async runHandler(
    handler: ActionHandler,
    action: PendingActionRow,
  ): Promise<HandlerResult> {
    const timeoutMs =
      this.config.getOrThrow<number>('ACTION_TIMEOUT_SEC') * 1000;
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        handler.handle(action),
        new Promise<HandlerResult>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
        }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { outcome: 'retry', error: message };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private apply(
    action: PendingActionRow,
    result: HandlerResult,
  ): Promise<number> {
    const now = this.clock.now();
    if (result.outcome === 'retry') {
      const delay = retryDelaySec(action.attempts, result.retryInSec);
      const runAt = new Date(now.getTime() + delay * 1000);
      return this.db.asWorker((tx) => {
        return tx.$executeRaw`
          UPDATE guardme.pending_actions
          SET status = 'scheduled',
              run_at = ${runAt}::timestamptz,
              last_error = ${result.error}
          WHERE id = ${action.id}::uuid
            AND status = 'running'
        `;
      });
    }
    const status = result.outcome;
    const lastError = result.outcome === 'done' ? null : failureText(result);
    return this.db.asWorker((tx) => {
      return tx.$executeRaw`
        UPDATE guardme.pending_actions
        SET status = ${status},
            last_error = ${lastError}
        WHERE id = ${action.id}::uuid
          AND status = 'running'
      `;
    });
  }
}

function failureText(
  result: Exclude<HandlerResult, { outcome: 'retry' }>,
): string {
  if (result.outcome === 'discarded') return result.reason;
  if (result.outcome === 'failed') return result.error;
  return '';
}
