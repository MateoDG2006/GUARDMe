import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createEmailSession } from './helpers/auth-sessions';
import { createApiApp, http, payload } from './helpers/api-app';
import { truncateGuardme } from './helpers/db-reset';

describe('location', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let api: PrismaClient;

  beforeAll(async () => {
    owner = new PrismaClient({
      datasourceUrl: process.env.DATABASE_URL_MIGRATIONS,
    });
    api = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_API });
    app = await createApiApp();
  });

  afterAll(async () => {
    await app.close();
    await owner.$disconnect();
    await api.$disconnect();
  });

  beforeEach(async () => {
    await truncateGuardme(owner);
  });

  it('[T25] refuses a location without consent and keeps the newer sample', async () => {
    const user = await session('self', 'Usuario');
    const reader = await session('caregiver', 'Lector');
    const outsider = await session('caregiver', 'Ajeno');
    const profile = await createUserProfile(user.token);
    await invite(user.token, profile.id, reader.token);
    await invite(user.token, profile.id, outsider.token);
    const installation = await install(user.token);

    const denied = await request(http(app))
      .post(`/v1/profiles/${profile.id}/location`)
      .set('Authorization', bearer(user.token))
      .set('X-Installation-Id', installation)
      .send(sample(0));
    expect(denied.status).toBe(403);
    expect((denied.body as { error: { code: string } }).error.code).toBe(
      'FORBIDDEN_ACTION',
    );

    await request(http(app))
      .put(`/v1/profiles/${profile.id}/location-consent`)
      .set('Authorization', bearer(user.token))
      .send({ enabled: true, readers: [reader.accountId] })
      .expect(200);

    const published = await request(http(app))
      .post(`/v1/profiles/${profile.id}/location`)
      .set('Authorization', bearer(user.token))
      .set('X-Installation-Id', installation)
      .send(sample(0))
      .expect(201);
    expect(payload<{ applied: boolean }>(published).applied).toBe(true);

    const older = await request(http(app))
      .post(`/v1/profiles/${profile.id}/location`)
      .set('Authorization', bearer(user.token))
      .set('X-Installation-Id', installation)
      .send(sample(-120_000))
      .expect(201);
    expect(payload<{ applied: boolean }>(older).applied).toBe(false);

    const future = await request(http(app))
      .post(`/v1/profiles/${profile.id}/location`)
      .set('Authorization', bearer(user.token))
      .set('X-Installation-Id', installation)
      .send(sample(180_000));
    expect(future.status).toBe(400);

    const seen = await request(http(app))
      .get(`/v1/profiles/${profile.id}/location`)
      .set('Authorization', bearer(reader.token))
      .expect(200);
    expect(payload<{ available: boolean; lat: number }>(seen)).toMatchObject({
      available: true,
      lat: 8.98,
    });

    const hidden = await request(http(app))
      .get(`/v1/profiles/${profile.id}/location`)
      .set('Authorization', bearer(outsider.token));
    expect(hidden.status).toBe(403);
    expect((hidden.body as { error: { code: string } }).error.code).toBe(
      'FORBIDDEN_ACTION',
    );

    const direct = await api.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT
          set_config('guardme.account_id', ${outsider.accountId}, true),
          set_config('guardme.auth_user_id', ${outsider.authUserId}, true),
          set_config('guardme.installation_id', '', true)
      `;
      return tx.$queryRaw<Array<{ profile_id: string }>>`
        SELECT profile_id
        FROM guardme.location_latest
        WHERE profile_id = ${profile.id}::uuid
      `;
    });
    expect(direct).toHaveLength(0);

    await request(http(app))
      .put(`/v1/profiles/${profile.id}/location-consent`)
      .set('Authorization', bearer(user.token))
      .send({ enabled: false, readers: [] })
      .expect(200);
    const afterRevoke = await request(http(app))
      .get(`/v1/profiles/${profile.id}/location`)
      .set('Authorization', bearer(user.token))
      .expect(200);
    expect(
      payload<{ available: boolean; reason: string }>(afterRevoke),
    ).toEqual({
      available: false,
      reason: 'no_data',
    });
  });

  async function session(
    kind: 'self' | 'caregiver',
    displayName: string,
  ): Promise<{ token: string; accountId: string; authUserId: string }> {
    const created = await createEmailSession(
      `${displayName}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@guardme.test`,
      'password-1234',
    );
    await request(http(app))
      .post('/v1/accounts/bootstrap')
      .set('Authorization', `Bearer ${created.accessToken}`)
      .send({ onboardingKind: kind, displayName })
      .expect(201);
    const me = await request(http(app))
      .get('/v1/me')
      .set('Authorization', `Bearer ${created.accessToken}`)
      .expect(200);
    return {
      token: created.accessToken,
      accountId: payload<{ account: { id: string } }>(me).account.id,
      authUserId: created.userId,
    };
  }

  async function createUserProfile(token: string): Promise<{ id: string }> {
    const response = await request(http(app))
      .post('/v1/profiles')
      .set('Authorization', bearer(token))
      .set('Idempotency-Key', `loc-${Date.now()}`)
      .send({ displayName: 'Casa', relation: 'user' })
      .expect(201);
    return payload<{ id: string }>(response);
  }

  async function invite(
    ownerToken: string,
    profileId: string,
    guestToken: string,
  ): Promise<void> {
    const issued = await request(http(app))
      .post(`/v1/profiles/${profileId}/invitations`)
      .set('Authorization', bearer(ownerToken))
      .send({ recipientHint: 'cuidador' })
      .expect(201);
    await request(http(app))
      .post('/v1/invitations/accept')
      .set('Authorization', bearer(guestToken))
      .send({
        secret: payload<{ secret: string }>(issued).secret,
        caregiverCategory: 'family',
      })
      .expect(201);
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

function sample(offsetMs: number): {
  lat: number;
  lng: number;
  accuracyM: number;
  capturedAt: string;
} {
  return {
    lat: 8.98,
    lng: -79.52,
    accuracyM: 12,
    capturedAt: new Date(Date.now() + offsetMs).toISOString(),
  };
}
