import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type PgBoss from 'pg-boss';
import { PolicyConfig } from '../../config/policy.config';
import { ClockPort } from '../../infra/clock/clock.port';
import { DbService } from '../../infra/db/db.service';
import { PG_BOSS } from '../../infra/queue/pgboss.provider';
import { OccurrenceHorizonJob } from '../reminders/occurrence-horizon.job';
import { MAINTENANCE_TASKS } from './queues';

@Injectable()
export class MaintenanceService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly db: DbService,
    private readonly clock: ClockPort,
    private readonly config: ConfigService,
    private readonly policy: PolicyConfig,
    private readonly horizon: OccurrenceHorizonJob,
    @Inject(PG_BOSS) private readonly boss: PgBoss,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const task of MAINTENANCE_TASKS) {
      await this.boss.createQueue(task.name).catch(() => undefined);
      await this.boss.schedule(task.name, task.cron, {});
      await this.boss.work(task.name, async () => {
        await this.run(task.name);
      });
    }
  }

  async run(name: (typeof MAINTENANCE_TASKS)[number]['name']): Promise<void> {
    const now = this.clock.now();
    if (name === 'cleanup-event-receipts') {
      const cutoff = new Date(
        now.getTime() - this.policy.eventReceiptRetentionDays * 86_400_000,
      );
      await this.db.asWorker((tx) => {
        return tx.$executeRaw`
          DELETE FROM guardme.event_receipts
          WHERE occurred_at < ${cutoff}::timestamptz
        `;
      });
      return;
    }
    if (name === 'cleanup-idempotency-keys') {
      const days = this.config.getOrThrow<number>(
        'IDEMPOTENCY_KEY_RETENTION_DAYS',
      );
      const cutoff = new Date(now.getTime() - days * 86_400_000);
      await this.db.asWorker((tx) => {
        return tx.$executeRaw`
          DELETE FROM guardme.idempotency_keys
          WHERE created_at < ${cutoff}::timestamptz
        `;
      });
      return;
    }
    if (name === 'extend-occurrence-horizon') {
      await this.horizon.extend(now);
      this.logger.log({ task: name });
      return;
    }
    await this.db.asWorker((tx) => {
      return tx.$executeRaw`
        UPDATE guardme.notifications
        SET status = 'expired'
        WHERE status IN ('pending', 'dispatched')
          AND expires_at < ${now}::timestamptz
      `;
    });
    this.logger.log({ task: name });
  }
}
