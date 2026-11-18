import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { DbService } from '../../infra/db/db.service';

@Injectable()
export class WorkerHeartbeatService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer: NodeJS.Timeout | null = null;
  private readonly workerId = process.env.WORKER_ID ?? 'guardme-worker';
  private readonly version = process.env.npm_package_version ?? '0.0.0';
  private readonly startedAt = new Date();

  constructor(private readonly db: DbService) {}

  onApplicationBootstrap(): void {
    void this.beat();
    this.timer = setInterval(() => void this.beat(), 15_000);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async beat(): Promise<void> {
    const now = new Date();
    await this.db.asWorker((tx) => {
      return tx.$executeRaw`
        INSERT INTO guardme.worker_heartbeats (worker_id, started_at, last_beat_at, version)
        VALUES (${this.workerId}, ${this.startedAt}::timestamptz, ${now}::timestamptz, ${this.version})
        ON CONFLICT (worker_id) DO UPDATE
        SET last_beat_at = EXCLUDED.last_beat_at,
            version = EXCLUDED.version
      `;
    });
  }
}
