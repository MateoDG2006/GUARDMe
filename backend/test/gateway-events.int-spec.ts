import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import {
  hashSecret,
  normalizeEnrollmentCode,
} from '../src/common/secrets/secret-codes';
import { FakeClock } from '../src/infra/clock/fake-clock';
import { createEmailSession } from './helpers/auth-sessions';
import { createApiApp, http, payload } from './helpers/api-app';
import { truncateGuardme } from './helpers/db-reset';

const CODE = 'ABCDE-FGHJK';
const NOW = new Date('2026-11-14T17:00:00.000Z');

describe('gateway events', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  const clock = new FakeClock(NOW);

  beforeAll(async () => {
    owner = new PrismaClient({
      datasourceUrl: process.env.DATABASE_URL_MIGRATIONS,
    });
    app = await createApiApp(clock);
  });

  afterAll(async () => {
    await app.close();
    await owner.$disconnect();
  });

  beforeEach(async () => {
    clock.set(NOW);
    await truncateGuardme(owner);
    await owner.$executeRaw`
      INSERT INTO guardme.canes (serial, model, claim_secret_hash)
      VALUES ('GM-2001', 'proto-esp32', ${hashSecret(normalizeEnrollmentCode(CODE))})
    `;
  });

  it('[T08] counts one false alarm across two batches and creates no incident', async () => {
    const user = await linkedUser('GM-2001');
    const event = cancel(user.caneId, 'cancel-1');
    const first = await postEvents(user, [event, event]);
    expect(first[0]?.status).toBe('accepted');
    expect(first[1]?.status).toBe('duplicate');
    const second = await postEvents(user, [event]);
    expect(second[0]?.status).toBe('duplicate');
    const totals = payload<{ total: number }>(
      await request(http(app))
        .get(`/v1/profiles/${user.profileId}/false-alarms`)
        .set('Authorization', bearer(user.token))
        .expect(200),
    );
    expect(totals.total).toBe(1);
    const incidents = await owner.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM guardme.incidents
    `;
    expect(incidents[0]?.n).toBe(0);
  });

  it('keeps the newest telemetry and returns a missing battery as null', async () => {
    const user = await linkedUser('GM-2001');
    const first = new Date(NOW.getTime() - 20_000).toISOString();
    const recent = new Date(NOW.getTime() - 10_000).toISOString();
    const older = new Date(NOW.getTime() - 400_000).toISOString();
    await postEvents(user, [telemetry(user.caneId, 'tel-1', first, {})]);
    const missing = payload<
      Array<{ telemetry: { batteryPct: number | null }; linkState: string }>
    >(
      await request(http(app))
        .get(`/v1/profiles/${user.profileId}/canes`)
        .set('Authorization', bearer(user.token))
        .expect(200),
    );
    expect(missing[0]?.telemetry?.batteryPct).toBeNull();
    await postEvents(user, [
      telemetry(user.caneId, 'tel-2', recent, {
        batteryPct: 80,
        linkStatus: 'connected',
        firmwareVersion: '1.2.0',
      }),
    ]);
    await postEvents(user, [
      telemetry(user.caneId, 'tel-3', older, {
        batteryPct: 10,
        linkStatus: 'disconnected',
      }),
    ]);
    const canes = payload<
      Array<{
        firmwareVersion: string | null;
        telemetry: {
          batteryPct: number | null;
          ageSeconds: number;
          linkStatus: string | null;
        };
        linkState: string;
      }>
    >(
      await request(http(app))
        .get(`/v1/profiles/${user.profileId}/canes`)
        .set('Authorization', bearer(user.token))
        .expect(200),
    );
    expect(canes[0]?.telemetry.batteryPct).toBe(80);
    expect(canes[0]?.telemetry.ageSeconds).toBe(10);
    expect(canes[0]?.linkState).toBe('connected');
    expect(canes[0]?.firmwareVersion).toBe('1.2.0');
  });

  it('rejects a retired gateway item and an event past retention without dropping the sibling', async () => {
    const user = await linkedUser('GM-2001');
    const other = await install(
      user.token,
      '22222222-2222-4222-8222-222222222222',
    );
    const denied = await request(http(app))
      .post('/v1/gateway-events')
      .set('Authorization', bearer(user.token))
      .set('X-Installation-Id', other)
      .send({ events: [cancel(user.caneId, 'nope')] })
      .expect(200);
    expect(
      payload<{ results: Array<{ status: string; code?: string }> }>(denied)
        .results[0],
    ).toEqual({
      eventId: 'nope',
      status: 'rejected',
      code: 'NOT_ACTIVE_GATEWAY',
    });
    const mixed = await postEvents(user, [
      telemetry(user.caneId, 'ok', NOW.toISOString(), { batteryPct: 50 }),
      {
        eventId: 'bad',
        type: 'telemetry_observed',
        occurredAt: NOW.toISOString(),
      },
      cancel(
        user.caneId,
        'ancient',
        new Date(NOW.getTime() - 31 * 86_400_000).toISOString(),
      ),
    ]);
    expect(mixed[0]?.status).toBe('accepted');
    expect(mixed[1]).toMatchObject({
      status: 'rejected',
      code: 'VALIDATION_FAILED',
    });
    expect(mixed[2]).toMatchObject({
      status: 'rejected',
      code: 'EVENT_TOO_OLD',
    });
    const totals = await owner.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM guardme.false_alarm_counters
    `;
    expect(totals[0]?.n).toBe(0);
  });

  async function postEvents(
    user: { token: string; installationId: string },
    events: unknown[],
  ) {
    const response = await request(http(app))
      .post('/v1/gateway-events')
      .set('Authorization', bearer(user.token))
      .set('X-Installation-Id', user.installationId)
      .send({ events })
      .expect(200);
    return payload<{
      results: Array<{ eventId: string; status: string; code?: string }>;
    }>(response).results;
  }

  async function linkedUser(serial: string) {
    const user = await account(
      `gw-${Date.now()}-${Math.floor(Math.random() * 1e6)}@guardme.test`,
    );
    const profile = await createProfile(user.token);
    const installationId = await install(
      user.token,
      '11111111-1111-4111-8111-111111111111',
    );
    const claimed = await request(http(app))
      .post('/v1/canes/claim')
      .set('Authorization', bearer(user.token))
      .send({ serial, claimCode: CODE, profileId: profile.id })
      .expect(201);
    const caneId = payload<{ id: string }>(claimed).id;
    await request(http(app))
      .post(`/v1/canes/${caneId}/gateway`)
      .set('Authorization', bearer(user.token))
      .set('X-Installation-Id', installationId)
      .expect(200);
    return { token: user.token, profileId: profile.id, installationId, caneId };
  }

  async function account(email: string) {
    const session = await createEmailSession(email, 'password-1234');
    await request(http(app))
      .post('/v1/accounts/bootstrap')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ onboardingKind: 'self', displayName: 'Ada' })
      .expect(201);
    return { token: session.accessToken };
  }

  async function createProfile(token: string) {
    const response = await request(http(app))
      .post('/v1/profiles')
      .set('Authorization', bearer(token))
      .set(
        'Idempotency-Key',
        `profile-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
      )
      .send({ displayName: 'Persona', relation: 'user' })
      .expect(201);
    return payload<{ id: string }>(response);
  }

  async function install(
    token: string,
    clientInstallationId: string,
  ): Promise<string> {
    const response = await request(http(app))
      .post('/v1/installations')
      .set('Authorization', bearer(token))
      .send({ clientInstallationId, platform: 'android', appVersion: '1.0.0' })
      .expect(201);
    return payload<{ id: string }>(response).id;
  }
});

function cancel(
  caneId: string,
  eventId: string,
  occurredAt = NOW.toISOString(),
) {
  return {
    eventId,
    type: 'false_alarm_canceled',
    caneId,
    occurredAt,
    payload: { cancelledVia: 'button' },
  };
}

function telemetry(
  caneId: string,
  eventId: string,
  capturedAt: string,
  extra: Record<string, unknown>,
) {
  return {
    eventId,
    type: 'telemetry_observed',
    caneId,
    occurredAt: capturedAt,
    payload: { capturedAt, ...extra },
  };
}

function bearer(token: string): string {
  return `Bearer ${token}`;
}
