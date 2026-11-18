import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type PgBoss from 'pg-boss';
import { Logger as PinoLogger } from 'nestjs-pino';
import { PG_BOSS } from './infra/queue/pgboss.provider';
import { RelayService } from './modules/pending-actions/relay.service';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));
  new Logger('Worker').log('worker ready');
  let stopping = false;
  const shutdown = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    await app.get(RelayService).stop();
    await app.get<PgBoss>(PG_BOSS).stop({ graceful: true });
    await app.close();
  };
  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
