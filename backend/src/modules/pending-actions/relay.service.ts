import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type PgBoss from 'pg-boss';
import { PG_BOSS } from '../../infra/queue/pgboss.provider';
import { ClockPort } from '../../infra/clock/clock.port';
import { DbService } from '../../infra/db/db.service';

@Injectable()
export class RelayService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RelayService.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private stopped = false;

  constructor(
    private readonly db: DbService,
    private readonly clock: ClockPort,
    private readonly config: ConfigService,
    @Inject(PG_BOSS) private readonly boss: PgBoss,
  ) {}

  onApplicationBootstrap(): void {
    void this.loop();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.stop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    while (this.ticking) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  async tick(): Promise<number> {
    const now = this.clock.now();
    const lease = new Date(
      now.getTime() + this.config.getOrThrow<number>('ACTION_LEASE_SEC') * 1000,
    );
    const claimed = await this.db.asWorker((tx) => {
      return tx.$queryRaw<Array<{ id: string; type: string }>>`
        WITH due AS (
          SELECT id
          FROM guardme.pending_actions
          WHERE (status = 'scheduled' AND run_at <= ${now}::timestamptz)
             OR (
               status IN ('dispatched', 'running')
               AND lease_until < ${now}::timestamptz
             )
          ORDER BY run_at
          LIMIT 100
          FOR UPDATE SKIP LOCKED
        )
        UPDATE guardme.pending_actions AS action
        SET status = 'dispatched',
            lease_until = ${lease}::timestamptz
        FROM due
        WHERE action.id = due.id
        RETURNING action.id, action.type
      `;
    });
    let published = 0;
    for (const row of claimed) {
      try {
        await this.boss.send(row.type, { actionId: row.id }, { retryLimit: 0 });
        published += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error({ actionId: row.id, type: row.type, message });
      }
    }
    return published;
  }

  private async loop(): Promise<void> {
    if (this.stopped) return;
    this.ticking = true;
    try {
      await this.tick();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ message });
    } finally {
      this.ticking = false;
    }
    if (this.stopped) return;
    const wait = this.config.getOrThrow<number>('RELAY_INTERVAL_MS');
    this.timer = setTimeout(() => void this.loop(), wait);
  }
}
