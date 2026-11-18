import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { ClockPort } from '../../src/infra/clock/clock.port';
import { mountAuth } from '../../src/modules/identity/better-auth';

export async function createApiApp(
  clock?: ClockPort,
): Promise<INestApplication> {
  let builder = Test.createTestingModule({
    imports: [AppModule],
  });
  if (clock) builder = builder.overrideProvider(ClockPort).useValue(clock);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  await mountAuth(app);
  configureApp(app);
  await app.init();
  return app;
}

export function http(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

export function payload<T>(response: { body: unknown }): T {
  return response.body as T;
}
