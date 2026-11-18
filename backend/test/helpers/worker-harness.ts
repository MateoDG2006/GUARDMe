import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { FakeTelephonyAdapter } from '../../src/infra/telephony/fake-telephony.adapter';
import { TelephonyPort } from '../../src/infra/telephony/telephony.port';
import { FakePushAdapter } from '../../src/infra/push/fake-push.adapter';
import { PushPort } from '../../src/infra/push/push.port';
import { FakeClock } from '../../src/infra/clock/fake-clock';
import { ClockPort } from '../../src/infra/clock/clock.port';
import { DispatcherService } from '../../src/modules/pending-actions/dispatcher.service';
import { RelayService } from '../../src/modules/pending-actions/relay.service';
import { OccurrenceHorizonJob } from '../../src/modules/reminders/occurrence-horizon.job';
import { WorkerModule } from '../../src/worker.module';

export interface WorkerHarness {
  clock: FakeClock;
  push: FakePushAdapter;
  telephony: FakeTelephonyAdapter;
  horizon: OccurrenceHorizonJob;
  relay: RelayService;
  dispatcher: DispatcherService;
  owner: PrismaClient;
  runDue(): Promise<void>;
  drain(): Promise<void>;
  close(): Promise<void>;
}

export async function createWorkerHarness(
  clock = new FakeClock(new Date()),
): Promise<WorkerHarness> {
  const owner = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL_MIGRATIONS,
  });
  const moduleRef = await Test.createTestingModule({
    imports: [WorkerModule],
  })
    .overrideProvider(ClockPort)
    .useValue(clock)
    .compile();
  try {
    await moduleRef.init();
  } catch (error) {
    await moduleRef.close();
    await owner.$disconnect();
    throw error;
  }
  const relay = moduleRef.get(RelayService);
  await relay.stop();
  const dispatcher = moduleRef.get(DispatcherService);
  const push = moduleRef.get(PushPort);
  const telephony = moduleRef.get(TelephonyPort);
  const horizon = moduleRef.get(OccurrenceHorizonJob);
  if (!(push instanceof FakePushAdapter)) {
    throw new Error('El worker de prueba no usa el adaptador falso');
  }
  if (!(telephony instanceof FakeTelephonyAdapter)) {
    throw new Error('El worker de prueba no usa telefonía falsa');
  }
  return {
    clock,
    push,
    telephony,
    horizon,
    relay,
    dispatcher,
    owner,
    runDue: () => runDue(relay, dispatcher, owner),
    drain: () => drain(clock, relay, dispatcher, owner),
    close: () => closeHarness(moduleRef, owner),
  };
}

async function runDue(
  relay: RelayService,
  dispatcher: DispatcherService,
  owner: PrismaClient,
): Promise<void> {
  await relay.tick();
  const rows = await owner.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM guardme.pending_actions
    WHERE status = 'dispatched'
  `;
  for (const row of rows) await dispatcher.runOne(row.id);
}

async function drain(
  clock: FakeClock,
  relay: RelayService,
  dispatcher: DispatcherService,
  owner: PrismaClient,
): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await runDue(relay, dispatcher, owner);
    const open = await owner.$queryRaw<
      Array<{ n: number; next_at: Date | null }>
    >`
      SELECT
        count(*)::int AS n,
        min(run_at) FILTER (WHERE status = 'scheduled') AS next_at
      FROM guardme.pending_actions
      WHERE status IN ('scheduled', 'dispatched', 'running')
    `;
    const row = open[0];
    if (!row || row.n === 0) return;
    if (row.next_at && row.next_at.getTime() > clock.now().getTime()) {
      clock.set(row.next_at);
      continue;
    }
  }
  throw new Error('La cola de acciones no se vació');
}

async function closeHarness(
  app: TestingModule,
  owner: PrismaClient,
): Promise<void> {
  await app.close();
  await owner.$disconnect();
}

export function spyWorkerErrors(): jest.SpyInstance {
  return jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);
}
