import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createEmailSession } from './helpers/auth-sessions';
import { createApiApp, http, payload } from './helpers/api-app';
import { truncateGuardme } from './helpers/db-reset';

describe('operations', () => {
  let app: INestApplication;
  let owner: PrismaClient;

  beforeAll(async () => {
    owner = new PrismaClient({
      datasourceUrl: process.env.DATABASE_URL_MIGRATIONS,
    });
    app = await createApiApp();
  });

  afterAll(async () => {
    await app.close();
    await owner.$disconnect();
  });

  beforeEach(async () => {
    await truncateGuardme(owner);
  });

  it('reports a stale worker and keeps incident traffic when telemetry is exhausted', async () => {
    const ready = await request(http(app)).get('/health/ready').expect(200);
    const readyBody = ready.body as {
      status: string;
      checks: { worker: string };
      details?: unknown;
    };
    expect(readyBody.status).toBe('degraded');
    expect(readyBody.checks.worker).toBe('stale');
    expect(readyBody.details).toBeUndefined();

    const detailed = await request(http(app))
      .get('/health/ready')
      .set('x-health-token', process.env.HEALTH_DETAILS_TOKEN ?? '')
      .expect(200);
    expect(
      (detailed.body as { details: { workerLastBeatAgeSec: number } }).details
        .workerLastBeatAgeSec,
    ).toBeGreaterThan(60);

    const user = await session('self', 'Usuario');
    const profile = await createUserProfile(user);
    const installation = await install(user);
    let limited = 0;
    for (let index = 0; index < 121; index += 1) {
      const response = await request(http(app))
        .post(`/v1/profiles/${profile.id}/location`)
        .set('Authorization', bearer(user))
        .set('X-Installation-Id', installation)
        .send({
          lat: 8.98,
          lng: -79.52,
          accuracyM: 10,
          capturedAt: new Date().toISOString(),
        });
      if (response.status === 429) limited += 1;
    }
    expect(limited).toBe(1);
    await request(http(app))
      .post('/v1/incidents')
      .set('Authorization', bearer(user))
      .set('X-Installation-Id', installation)
      .set('Idempotency-Key', `ops-${Date.now()}`)
      .send({
        origin: 'manual_emergency',
        sourceEventId: `ops-${Date.now()}`,
        profileId: profile.id,
        reportedOccurredAt: new Date().toISOString(),
        protocolVersion: '1',
      })
      .expect(201);
  });

  it('[T26] marks a cane link stale when telemetry is old', async () => {
    const user = await session('self', 'Usuario');
    const profile = await createUserProfile(user);
    const account = await request(http(app))
      .get('/v1/me')
      .set('Authorization', bearer(user))
      .expect(200);
    const accountId = payload<{ account: { id: string } }>(account).account.id;
    const installation = await install(user);
    const caneId = crypto.randomUUID();
    const assignmentId = crypto.randomUUID();
    await owner.$executeRaw`
      INSERT INTO guardme.canes (id, serial, model, claim_secret_hash, status)
      VALUES (${caneId}::uuid, ${`S-${Date.now()}`}, 'gm-1', 'hash', 'assigned')
    `;
    await owner.$executeRaw`
      INSERT INTO guardme.cane_assignments (id, cane_id, profile_id, assigned_by_account_id)
      VALUES (${assignmentId}::uuid, ${caneId}::uuid, ${profile.id}::uuid, ${accountId}::uuid)
    `;
    await owner.$executeRaw`
      INSERT INTO guardme.cane_telemetry_latest (
        cane_assignment_id, cane_id, link_status, captured_at, received_at, source_installation_id
      )
      VALUES (
        ${assignmentId}::uuid,
        ${caneId}::uuid,
        'connected',
        now() - interval '2 hours',
        now() - interval '2 hours',
        ${installation}::uuid
      )
    `;
    const listed = await request(http(app))
      .get(`/v1/profiles/${profile.id}/canes`)
      .set('Authorization', bearer(user))
      .expect(200);
    expect(payload<Array<{ linkState: string }>>(listed)[0]?.linkState).toBe(
      'stale',
    );
  });

  async function session(
    kind: 'self' | 'caregiver',
    displayName: string,
  ): Promise<string> {
    const created = await createEmailSession(
      `${displayName}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@guardme.test`,
      'password-1234',
    );
    await request(http(app))
      .post('/v1/accounts/bootstrap')
      .set('Authorization', `Bearer ${created.accessToken}`)
      .send({ onboardingKind: kind, displayName })
      .expect(201);
    return created.accessToken;
  }

  async function createUserProfile(token: string): Promise<{ id: string }> {
    const response = await request(http(app))
      .post('/v1/profiles')
      .set('Authorization', bearer(token))
      .set('Idempotency-Key', `ops-profile-${Date.now()}`)
      .send({ displayName: 'Casa', relation: 'user' })
      .expect(201);
    return payload<{ id: string }>(response);
  }

  async function install(token: string): Promise<string> {
    const response = await request(http(app))
      .post('/v1/installations')
      .set('Authorization', bearer(token))
      .send({
        clientInstallationId: crypto.randomUUID(),
        platform: 'android',
        appVersion: '1.0.0',
        pushToken: `push-${Date.now()}`,
      })
      .expect(201);
    return payload<{ id: string }>(response).id;
  }
});

function bearer(token: string): string {
  return `Bearer ${token}`;
}
