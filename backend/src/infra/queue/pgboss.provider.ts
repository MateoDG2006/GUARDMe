import type { ConfigService } from '@nestjs/config';
import PgBoss from 'pg-boss';

export const PG_BOSS = Symbol('PG_BOSS');

export function createBoss(config: ConfigService): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString: config.getOrThrow<string>('DATABASE_URL_WORKER'),
    schema: 'pgboss',
    migrate: false,
    supervise: true,
    schedule: true,
  });
  boss.on('error', () => undefined);
  return boss.start();
}
