import { timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DbService } from '../../infra/db/db.service';

export interface ReadyResponse {
  status: 'ok' | 'degraded' | 'down';
  checks: {
    db: 'up' | 'down';
    worker: 'up' | 'stale';
    queue: 'ok' | 'backlog';
    push: 'ok' | 'failing';
  };
  details?: ReadyDetails;
}

export interface ReadyDetails {
  workerLastBeatAgeSec: number;
  oldestDueActionAgeSec: number;
  failedActionsLast24h: number;
  deliveriesFailedLast1h: number;
  uncertainCallAttempts: number;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly db: DbService,
    private readonly config: ConfigService,
  ) {}

  async ready(
    token?: string,
  ): Promise<{ statusCode: number; body: ReadyResponse }> {
    try {
      await this.db.pingApi();
    } catch {
      return {
        statusCode: 503,
        body: {
          status: 'down',
          checks: {
            db: 'down',
            worker: 'stale',
            queue: 'backlog',
            push: 'failing',
          },
        },
      };
    }
    const snapshot = await this.db.asApi((tx) => {
      return tx.$queryRaw<
        Array<{
          worker_last_beat_age_sec: number;
          oldest_due_action_age_sec: number;
          failed_actions_last_24h: number;
          deliveries_failed_last_1h: number;
          deliveries_last_1h: number;
          uncertain_call_attempts: number;
        }>
      >`SELECT * FROM guardme.health_snapshot()`;
    });
    const row = snapshot[0];
    const workerAge = row?.worker_last_beat_age_sec ?? 999999;
    const queueAge = row?.oldest_due_action_age_sec ?? 0;
    const failed = row?.deliveries_failed_last_1h ?? 0;
    const total = row?.deliveries_last_1h ?? 0;
    const workerStale =
      workerAge > this.config.getOrThrow<number>('HEALTH_WORKER_STALE_SEC');
    const backlog =
      queueAge > this.config.getOrThrow<number>('HEALTH_QUEUE_STALE_SEC');
    const pushFailing =
      total > 0 &&
      failed / total > this.config.getOrThrow<number>('HEALTH_PUSH_FAIL_RATIO');
    const body: ReadyResponse = {
      status: workerStale || backlog || pushFailing ? 'degraded' : 'ok',
      checks: {
        db: 'up',
        worker: workerStale ? 'stale' : 'up',
        queue: backlog ? 'backlog' : 'ok',
        push: pushFailing ? 'failing' : 'ok',
      },
    };
    if (this.tokenMatches(token)) {
      body.details = {
        workerLastBeatAgeSec: workerAge,
        oldestDueActionAgeSec: queueAge,
        failedActionsLast24h: row?.failed_actions_last_24h ?? 0,
        deliveriesFailedLast1h: failed,
        uncertainCallAttempts: row?.uncertain_call_attempts ?? 0,
      };
    }
    return { statusCode: 200, body };
  }

  private tokenMatches(token?: string): boolean {
    const expected = this.config.getOrThrow<string>('HEALTH_DETAILS_TOKEN');
    if (!token) return false;
    const left = Buffer.from(token);
    const right = Buffer.from(expected);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }
}
