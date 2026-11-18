import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { FakeClock } from '../src/infra/clock/fake-clock';
import { createEmailSession } from './helpers/auth-sessions';
import { createApiApp, http, payload } from './helpers/api-app';
import { truncateGuardme } from './helpers/db-reset';
import {
  createWorkerHarness,
  type WorkerHarness,
} from './helpers/worker-harness';

describe('sync', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let worker: WorkerHarness;
  const clock = new FakeClock(new Date('2026-11-16T15:00:00.000Z'));

  beforeAll(async () => {
    owner = new PrismaClient({
      datasourceUrl: process.env.DATABASE_URL_MIGRATIONS,
    });
    app = await createApiApp(clock);
    worker = await createWorkerHarness(clock);
  });

  afterAll(async () => {
    await worker.close();
    await app.close();
    await owner.$disconnect();
  });

  beforeEach(async () => {
    await truncateGuardme(owner);
    worker.push.sent.length = 0;
    clock.set(new Date('2026-11-16T15:00:00.000Z'));
  });

  it('[T28] hides an open transaction and drops a revoked caregiver', async () => {
    const user = await session('self', 'Usuario');
    const caregiver = await session('caregiver', 'Cuidador');
    const profile = await createUserProfile(user.token);
    const accessId = await invite(user.token, profile.id, caregiver.token);
    const first = await request(http(app))
      .get('/v1/changes')
      .set('Authorization', bearer(caregiver.token))
      .expect(200);
    const page = payload<{ nextCursor: string; resetRequired: boolean }>(first);
    expect(page.resetRequired).toBe(true);

    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = owner.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          UPDATE guardme.profiles
          SET display_name = 'oculto'
          WHERE id = ${profile.id}::uuid
        `;
        await gate;
      },
      { timeout: 20_000 },
    );
    const during = await request(http(app))
      .get('/v1/changes')
      .query({ cursor: page.nextCursor })
      .set('Authorization', bearer(caregiver.token))
      .expect(200);
    expect(JSON.stringify(during.body)).not.toContain('oculto');
    release();
    await pending;

    await request(http(app))
      .delete(`/v1/profiles/${profile.id}/memberships/${accessId}`)
      .set('Authorization', bearer(user.token))
      .expect(204);
    const gone = await request(http(app))
      .get(`/v1/profiles/${profile.id}/location`)
      .set('Authorization', bearer(caregiver.token));
    expect(gone.status).toBe(404);
  });

  it('collapses twenty changes into one sync push per installation', async () => {
    const user = await session('self', 'Usuario');
    const caregiver = await session('caregiver', 'Cuidador');
    const profile = await createUserProfile(user.token);
    await invite(user.token, profile.id, caregiver.token);
    await install(user.token, 'user-token');
    await install(caregiver.token, 'caregiver-token');
    const created = await request(http(app))
      .post(`/v1/profiles/${profile.id}/reminders`)
      .set('Authorization', bearer(user.token))
      .set('Idempotency-Key', `rem-${Date.now()}`)
      .send({
        kind: 'medication',
        title: 'dosis',
        schedules: [
          {
            localTime: '08:00',
            daysOfWeek: [1],
            validFrom: '2026-11-16',
          },
        ],
      })
      .expect(201);
    let version = payload<{ version: number; id: string }>(created).version;
    const reminderId = payload<{ id: string }>(created).id;
    for (let index = 0; index < 20; index += 1) {
      const updated = await request(http(app))
        .patch(`/v1/reminders/${reminderId}`)
        .set('Authorization', bearer(user.token))
        .send({ expectedVersion: version, title: `dosis ${index}` })
        .expect(200);
      version = payload<{ version: number }>(updated).version;
    }
    const queued = await owner.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n
      FROM guardme.pending_actions
      WHERE type = 'SYNC_SIGNAL'
        AND status = 'scheduled'
    `;
    expect(queued[0]?.n).toBe(1);
    clock.advance(5_000);
    await worker.runDue();
    const syncPushes = worker.push.sent.filter(
      (message) => message.type === 'sync',
    );
    expect(syncPushes).toHaveLength(2);
    expect(syncPushes.every((message) => message.title == null)).toBe(true);
  });

  async function session(
    kind: 'self' | 'caregiver',
    displayName: string,
  ): Promise<{ token: string }> {
    const created = await createEmailSession(
      `${displayName}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@guardme.test`,
      'password-1234',
    );
    await request(http(app))
      .post('/v1/accounts/bootstrap')
      .set('Authorization', `Bearer ${created.accessToken}`)
      .send({ onboardingKind: kind, displayName })
      .expect(201);
    return { token: created.accessToken };
  }

  async function createUserProfile(token: string): Promise<{ id: string }> {
    const response = await request(http(app))
      .post('/v1/profiles')
      .set('Authorization', bearer(token))
      .set('Idempotency-Key', `sync-${Date.now()}`)
      .send({ displayName: 'Casa', relation: 'user' })
      .expect(201);
    return payload<{ id: string }>(response);
  }

  async function invite(
    ownerToken: string,
    profileId: string,
    guestToken: string,
  ): Promise<string> {
    const issued = await request(http(app))
      .post(`/v1/profiles/${profileId}/invitations`)
      .set('Authorization', bearer(ownerToken))
      .send({})
      .expect(201);
    const accepted = await request(http(app))
      .post('/v1/invitations/accept')
      .set('Authorization', bearer(guestToken))
      .send({
        secret: payload<{ secret: string }>(issued).secret,
        caregiverCategory: 'family',
      })
      .expect(201);
    return payload<{ accessId: string }>(accepted).accessId;
  }

  async function install(token: string, pushToken: string): Promise<void> {
    await request(http(app))
      .post('/v1/installations')
      .set('Authorization', bearer(token))
      .send({
        clientInstallationId: crypto.randomUUID(),
        platform: 'android',
        appVersion: '1.0.0',
        pushToken,
      })
      .expect(201);
  }
});

function bearer(token: string): string {
  return `Bearer ${token}`;
}
