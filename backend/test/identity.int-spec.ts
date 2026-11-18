import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { PRISMA_API } from '../src/infra/db/db.service';
import {
  createApiApp,
  http,
  payload,
} from './helpers/api-app';
import {
  createAnonymousSession,
  createEmailSession,
  signOut,
} from './helpers/auth-sessions';
import { truncateGuardme } from './helpers/db-reset';

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (name.endsWith('.ts')) files.push(full);
  }
  return files;
}

describe('identity', () => {
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

  it('keeps health public', async () => {
    await request(http(app)).get('/health/live').expect(200);
  });

  it('[T31] rejects a missing session token before resolve_principal', async () => {
    const api = app.get<PrismaClient>(PRISMA_API);
    const spy = jest.spyOn(api, '$queryRaw');
    const response = await request(http(app))
      .get('/v1/me')
      .set('Authorization', 'Bearer not-a-real-session-token');
    expect(response.status).toBe(401);
    expect(payload<{ error: { code: string } }>(response).error.code).toBe(
      'UNAUTHENTICATED',
    );
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('[T34] keeps service role keys out of src and out of /v1/me', async () => {
    for (const file of walk(join(__dirname, '../src'))) {
      const text = readFileSync(file, 'utf8');
      expect(text.includes('SERVICE_ROLE')).toBe(false);
      expect(text.includes('service_role')).toBe(false);
    }

    const session = await createEmailSession(
      `me-${Date.now()}@guardme.test`,
      'password-1234',
    );
    await request(http(app))
      .post('/v1/accounts/bootstrap')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ onboardingKind: 'self', displayName: 'Ada' })
      .expect(201);
    const installation = await request(http(app))
      .post('/v1/installations')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        clientInstallationId: '55555555-5555-4555-8555-555555555555',
        platform: 'android',
        appVersion: '1.0.0',
        pushToken: 'secret-push-token',
      })
      .expect(201);
    const me = await request(http(app))
      .get('/v1/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .set('X-Installation-Id', payload<{ id: string }>(installation).id)
      .expect(200);
    const meBody = payload<{
      capabilities: { emergencyAutoCall: string; pendingPolicies: string[] };
      installation: { hasPushToken: boolean };
      accesses: unknown[];
    }>(me);
    const body = JSON.stringify(meBody);
    expect(body.includes('push_token')).toBe(false);
    expect(body.includes('secret')).toBe(false);
    expect(body.includes('key')).toBe(false);
    expect(meBody.capabilities.emergencyAutoCall).toBe('not_enabled');
    expect(meBody.capabilities.pendingPolicies).toEqual([
      'PD-03',
      'PD-04',
      'PD-05',
      'PD-06',
      'PD-07',
      'PD-08',
      'PD-10',
      'PD-12',
    ]);
    expect(meBody.installation.hasPushToken).toBe(true);
    expect(meBody.accesses).toEqual([]);
  });

  it('bootstraps once under two parallel requests', async () => {
    const session = await createEmailSession(
      `race-${Date.now()}@guardme.test`,
      'password-1234',
    );
    const send = () =>
      request(http(app))
        .post('/v1/accounts/bootstrap')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ onboardingKind: 'caregiver', displayName: 'Bea' });
    const [first, second] = await Promise.all([send(), send()]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(payload<{ account: { id: string } }>(first).account.id).toBe(
      payload<{ account: { id: string } }>(second).account.id,
    );
    const rows = await owner.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n
      FROM guardme.accounts
      WHERE auth_user_id = ${session.userId}::uuid
    `;
    expect(rows[0]?.n).toBe(1);
  });

  it('rejects an anonymous bootstrap and an unbootstrapped profile', async () => {
    const session = await createAnonymousSession();
    const bootstrap = await request(http(app))
      .post('/v1/accounts/bootstrap')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ onboardingKind: 'self' });
    expect(bootstrap.status).toBe(403);
    expect(payload<{ error: { code: string } }>(bootstrap).error.code).toBe(
      'FORBIDDEN_ACTION',
    );

    const me = await request(http(app))
      .get('/v1/me')
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(me.status).toBe(403);
    expect(payload<{ error: { code: string } }>(me).error.code).toBe(
      'ACCOUNT_NOT_BOOTSTRAPPED',
    );
  });

  it('keeps a single active installation for the same client id', async () => {
    const session = await createEmailSession(
      `install-${Date.now()}@guardme.test`,
      'password-1234',
    );
    await request(http(app))
      .post('/v1/accounts/bootstrap')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ onboardingKind: 'self' })
      .expect(201);
    const body = {
      clientInstallationId: '66666666-6666-4666-8666-666666666666',
      platform: 'android',
      appVersion: '1.0.0',
    };
    const first = await request(http(app))
      .post('/v1/installations')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send(body)
      .expect(201);
    const second = await request(http(app))
      .post('/v1/installations')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ ...body, appVersion: '1.0.1' })
      .expect(201);
    expect(payload<{ id: string }>(second).id).toBe(
      payload<{ id: string }>(first).id,
    );
    expect(payload<{ appVersion: string }>(second).appVersion).toBe('1.0.1');
    const rows = await owner.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n
      FROM guardme.installations
      WHERE client_installation_id = ${body.clientInstallationId}::uuid
        AND status = 'active'
    `;
    expect(rows[0]?.n).toBe(1);
  });

  it('[T36] revokes the session and the installation', async () => {
    const signedOut = await createEmailSession(
      `signout-${Date.now()}@guardme.test`,
      'password-1234',
    );
    await request(http(app))
      .post('/v1/accounts/bootstrap')
      .set('Authorization', `Bearer ${signedOut.accessToken}`)
      .send({ onboardingKind: 'self' })
      .expect(201);
    const registered = await request(http(app))
      .post('/v1/installations')
      .set('Authorization', `Bearer ${signedOut.accessToken}`)
      .send({
        clientInstallationId: '77777777-7777-4777-8777-777777777777',
        platform: 'android',
        appVersion: '1.0.0',
      })
      .expect(201);
    await request(http(app))
      .get('/v1/me')
      .set('Authorization', `Bearer ${signedOut.accessToken}`)
      .set('X-Installation-Id', payload<{ id: string }>(registered).id)
      .expect(200);
    await signOut(signedOut);
    const afterSignOut = await request(http(app))
      .get('/v1/me')
      .set('Authorization', `Bearer ${signedOut.accessToken}`)
      .set('X-Installation-Id', payload<{ id: string }>(registered).id);
    expect(afterSignOut.status).toBe(401);
    expect(payload<{ error: { code: string } }>(afterSignOut).error.code).toBe(
      'UNAUTHENTICATED',
    );

    const revoked = await createEmailSession(
      `revoke-${Date.now()}@guardme.test`,
      'password-1234',
    );
    await request(http(app))
      .post('/v1/accounts/bootstrap')
      .set('Authorization', `Bearer ${revoked.accessToken}`)
      .send({ onboardingKind: 'self' })
      .expect(201);
    const installation = await request(http(app))
      .post('/v1/installations')
      .set('Authorization', `Bearer ${revoked.accessToken}`)
      .send({
        clientInstallationId: '88888888-8888-4888-8888-888888888888',
        platform: 'android',
        appVersion: '1.0.0',
      })
      .expect(201);
    await request(http(app))
      .delete(`/v1/installations/${payload<{ id: string }>(installation).id}`)
      .set('Authorization', `Bearer ${revoked.accessToken}`)
      .expect(204);
    const afterRevoke = await request(http(app))
      .get('/v1/me')
      .set('Authorization', `Bearer ${revoked.accessToken}`)
      .set('X-Installation-Id', payload<{ id: string }>(installation).id);
    expect(afterRevoke.status).toBe(401);
    expect(payload<{ error: { code: string } }>(afterRevoke).error.code).toBe(
      'SESSION_REVOKED',
    );
  });

  it('logout all revokes Better Auth sessions without X-Installation-Id', async () => {
    const session = await createEmailSession(
      `logout-all-${Date.now()}@guardme.test`,
      'password-1234',
    );
    await request(http(app))
      .post('/v1/accounts/bootstrap')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ onboardingKind: 'self' })
      .expect(201);
    await request(http(app))
      .get('/v1/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    await request(http(app))
      .post('/v1/session/logout')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ scope: 'all' })
      .expect(201);
    const after = await request(http(app))
      .get('/v1/me')
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(after.status).toBe(401);
    expect(payload<{ error: { code: string } }>(after).error.code).toBe(
      'UNAUTHENTICATED',
    );
  });

  it('rejects a body that names accountId', async () => {
    const session = await createEmailSession(
      `extra-${Date.now()}@guardme.test`,
      'password-1234',
    );
    const response = await request(http(app))
      .post('/v1/accounts/bootstrap')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        onboardingKind: 'self',
        accountId: '99999999-9999-4999-8999-999999999999',
      });
    expect(response.status).toBe(400);
    expect(payload<{ error: { code: string } }>(response).error.code).toBe(
      'VALIDATION_FAILED',
    );
  });

  it('revokes the other installation that already holds the push token', async () => {
    const first = await createEmailSession(
      `push-a-${Date.now()}@guardme.test`,
      'password-1234',
    );
    const second = await createEmailSession(
      `push-b-${Date.now()}@guardme.test`,
      'password-1234',
    );
    for (const session of [first, second]) {
      await request(http(app))
        .post('/v1/accounts/bootstrap')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ onboardingKind: 'self' })
        .expect(201);
    }
    const previous = await request(http(app))
      .post('/v1/installations')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .send({
        clientInstallationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        platform: 'android',
        appVersion: '1.0.0',
        pushToken: 'shared-device-token',
      })
      .expect(201);
    const current = await request(http(app))
      .post('/v1/installations')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .send({
        clientInstallationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        platform: 'android',
        appVersion: '1.0.0',
        pushToken: 'shared-device-token',
      })
      .expect(201);
    expect(payload<{ hasPushToken: boolean }>(current).hasPushToken).toBe(true);
    const rows = await owner.$queryRaw<
      Array<{ status: string; revoke_reason: string | null }>
    >`
      SELECT status, revoke_reason
      FROM guardme.installations
      WHERE id = ${payload<{ id: string }>(previous).id}::uuid
    `;
    expect(rows[0]).toEqual({ status: 'revoked', revoke_reason: 'replaced' });
  });
});
