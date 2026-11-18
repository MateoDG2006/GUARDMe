import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import {
  createAnonymousSession,
  createEmailSession,
} from './helpers/auth-sessions';
import { createApiApp, http, payload } from './helpers/api-app';
import { truncateGuardme } from './helpers/db-reset';

describe('onboarding', () => {
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

  it('[T03] keeps distinct resumable flows and does not duplicate a profile', async () => {
    const self = await account(
      'self',
      `self-${Date.now()}@guardme.test`,
      'Ada',
    );
    const caregiver = await account(
      'caregiver',
      `care-${Date.now()}@guardme.test`,
      'Ana',
    );
    const selfProfile = await request(http(app))
      .post('/v1/profiles')
      .set('Authorization', bearer(self))
      .set('Idempotency-Key', 'self-profile')
      .send({ displayName: 'Yo', relation: 'user' })
      .expect(201);
    const replay = await request(http(app))
      .post('/v1/profiles')
      .set('Authorization', bearer(self))
      .set('Idempotency-Key', 'self-profile')
      .send({ displayName: 'Yo', relation: 'user' })
      .expect(201);
    expect(replay.headers['x-idempotent-replay']).toBe('true');
    expect(payload<{ id: string }>(replay).id).toBe(
      payload<{ id: string }>(selfProfile).id,
    );
    const careProfile = await request(http(app))
      .post('/v1/profiles')
      .set('Authorization', bearer(caregiver))
      .set('Idempotency-Key', 'care-profile')
      .send({
        displayName: 'Perfil',
        relation: 'caregiver',
        caregiverCategory: 'family',
      })
      .expect(201);

    const selfFlow = await onboarding(
      self,
      payload<{ id: string }>(selfProfile).id,
    );
    const careFlow = await onboarding(
      caregiver,
      payload<{ id: string }>(careProfile).id,
    );
    expect(selfFlow.flow).toBe('self');
    expect(careFlow.flow).toBe('caregiver');
    expect(selfFlow.steps.map((step) => step.step)).not.toEqual(
      careFlow.steps.map((step) => step.step),
    );
    for (const step of [...selfFlow.steps, ...careFlow.steps]) {
      if (step.source !== 'server' || step.status !== 'done') continue;
      expect(['account', 'profile']).toContain(step.step);
    }

    await request(http(app))
      .post('/v1/onboarding/steps')
      .set('Authorization', bearer(self))
      .send({
        profileId: payload<{ id: string }>(selfProfile).id,
        step: 'pin_set',
        status: 'done',
      })
      .expect(201);
    const resumed = await onboarding(
      self,
      payload<{ id: string }>(selfProfile).id,
    );
    expect(resumed.steps.find((step) => step.step === 'pin_set')).toMatchObject(
      {
        status: 'done',
        source: 'device',
      },
    );
    const rows = await owner.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM guardme.profiles WHERE display_name = 'Yo'
    `;
    expect(rows[0]?.n).toBe(1);
  });

  it('[T35] enrolls an anonymous phone and replaces that user without moving the caregiver', async () => {
    const anon = await createAnonymousSession();
    const blocked = await request(http(app))
      .get('/v1/profiles')
      .set('Authorization', `Bearer ${anon.accessToken}`);
    expect(blocked.status).toBe(403);
    expect(payload<{ error: { code: string } }>(blocked).error.code).toBe(
      'ACCOUNT_NOT_BOOTSTRAPPED',
    );

    const caregiver = await account(
      'caregiver',
      `enroll-${Date.now()}@guardme.test`,
      'Ana',
    );
    const profile = payload<{ id: string }>(
      await request(http(app))
        .post('/v1/profiles')
        .set('Authorization', bearer(caregiver))
        .set('Idempotency-Key', 'enroll-profile')
        .send({
          displayName: 'Persona',
          relation: 'caregiver',
          caregiverCategory: 'medical',
        })
        .expect(201),
    );
    const issued = payload<{ code: string }>(
      await request(http(app))
        .post(`/v1/profiles/${profile.id}/enrollments`)
        .set('Authorization', bearer(caregiver))
        .send({ purpose: 'initial' })
        .expect(201),
    );
    const consumed = await request(http(app))
      .post('/v1/enrollments/consume')
      .set('Authorization', `Bearer ${anon.accessToken}`)
      .send({
        code: issued.code.replace('-', ' '),
        clientInstallationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        appVersion: '1.0.0',
      });
    expect(consumed.status).toBe(201);
    const first = payload<{
      access: { relation: string; profileId: string };
      installation: { id: string };
    }>(consumed);
    expect(first.access.relation).toBe('user');
    expect(first.access.profileId).toBe(profile.id);

    const other = await createAnonymousSession();
    const reused = await request(http(app))
      .post('/v1/enrollments/consume')
      .set('Authorization', `Bearer ${other.accessToken}`)
      .send({
        code: issued.code,
        clientInstallationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        appVersion: '1.0.0',
      });
    expect(reused.status).toBe(404);

    const replacement = payload<{ code: string }>(
      await request(http(app))
        .post(`/v1/profiles/${profile.id}/enrollments`)
        .set('Authorization', bearer(caregiver))
        .send({ purpose: 'replace_user' })
        .expect(201),
    );
    const phone = await createAnonymousSession();
    const replaced = await request(http(app))
      .post('/v1/enrollments/consume')
      .set('Authorization', `Bearer ${phone.accessToken}`)
      .send({
        code: replacement.code,
        clientInstallationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        appVersion: '1.0.1',
      })
      .expect(201);
    expect(
      payload<{ access: { profileId: string } }>(replaced).access.profileId,
    ).toBe(profile.id);
    const previous = await owner.$queryRaw<
      Array<{ access_status: string; installation_status: string }>
    >`
      SELECT pa.status AS access_status, i.status AS installation_status
      FROM guardme.installations i
      JOIN guardme.profile_access pa ON pa.account_id = i.account_id
      WHERE i.id = ${first.installation.id}::uuid
    `;
    expect(previous[0]).toEqual({
      access_status: 'revoked',
      installation_status: 'revoked',
    });
    await request(http(app))
      .get(`/v1/profiles/${profile.id}`)
      .set('Authorization', bearer(caregiver))
      .expect(200);

    const details = await owner.$queryRaw<Array<{ details: string }>>`
      SELECT details::text AS details FROM guardme.audit_log
    `;
    const blob = details.map((row) => row.details).join('\n');
    expect(blob.includes(issued.code)).toBe(false);
    expect(blob.includes(replacement.code)).toBe(false);
  });

  async function onboarding(token: string, profileId: string) {
    const response = await request(http(app))
      .get(`/v1/onboarding?profileId=${profileId}`)
      .set('Authorization', bearer(token))
      .expect(200);
    return payload<{
      flow: string;
      steps: Array<{ step: string; status: string; source: string }>;
    }>(response);
  }

  async function account(
    kind: 'self' | 'caregiver',
    email: string,
    displayName: string,
  ): Promise<string> {
    const session = await createEmailSession(email, 'password-1234');
    await request(http(app))
      .post('/v1/accounts/bootstrap')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ onboardingKind: kind, displayName })
      .expect(201);
    return session.accessToken;
  }
});

function bearer(token: string): string {
  return `Bearer ${token}`;
}
