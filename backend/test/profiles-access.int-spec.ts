import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createEmailSession } from './helpers/auth-sessions';
import { createApiApp, http, payload } from './helpers/api-app';
import { truncateGuardme } from './helpers/db-reset';
import type { INestApplication } from '@nestjs/common';

describe('profiles and access', () => {
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

  it('[T01] keeps one profile when a second caregiver joins', async () => {
    const caregiver = await bootstrap(
      'caregiver',
      `a-${Date.now()}@guardme.test`,
      'Ana',
    );
    const guest = await bootstrap(
      'caregiver',
      `b-${Date.now()}@guardme.test`,
      'Bea',
    );
    const first = await createProfile(caregiver, 'P1', 'family');
    const second = await createProfile(caregiver, 'P2', 'family');
    const invite = await request(http(app))
      .post(`/v1/profiles/${first.id}/invitations`)
      .set('Authorization', bearer(caregiver))
      .send({ recipientHint: 'Bea' })
      .expect(201);
    await request(http(app))
      .post('/v1/invitations/accept')
      .set('Authorization', bearer(guest))
      .send({
        secret: payload<{ secret: string }>(invite).secret,
        caregiverCategory: 'family',
      })
      .expect(201);

    const seenByGuest = await request(http(app))
      .get('/v1/profiles')
      .set('Authorization', bearer(guest))
      .expect(200);
    const seenByOwner = await request(http(app))
      .get('/v1/profiles')
      .set('Authorization', bearer(caregiver))
      .expect(200);
    expect(
      payload<Array<{ displayName: string }>>(seenByGuest).map(
        (row) => row.displayName,
      ),
    ).toEqual(['P1']);
    expect(
      payload<Array<{ displayName: string }>>(seenByOwner)
        .map((row) => row.displayName)
        .sort(),
    ).toEqual(['P1', 'P2']);
    const count = await owner.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM guardme.profiles WHERE display_name = 'P1'
    `;
    expect(count[0]?.n).toBe(1);
    expect(second.id).not.toBe(first.id);

    const members = await request(http(app))
      .get(`/v1/profiles/${first.id}/memberships`)
      .set('Authorization', bearer(caregiver))
      .expect(200);
    const guestAccess = payload<
      Array<{ accessId: string; displayName: string }>
    >(members).find((row) => row.displayName === 'Bea');
    expect(guestAccess).toBeDefined();
    await request(http(app))
      .delete(`/v1/profiles/${first.id}/memberships/${guestAccess?.accessId}`)
      .set('Authorization', bearer(caregiver))
      .expect(204);
    const hidden = await request(http(app))
      .get(`/v1/profiles/${first.id}`)
      .set('Authorization', bearer(guest));
    expect(hidden.status).toBe(404);
    expect(payload<{ error: { code: string } }>(hidden).error.code).toBe(
      'NOT_FOUND',
    );
  });

  it('[T02] gives family and medical the same route results', async () => {
    const family = await runCategory('family');
    const medical = await runCategory('medical');
    expect(family.statuses).toEqual(medical.statuses);
    expect(family.relation).toBe('caregiver');
    expect(medical.relation).toBe('caregiver');
    expect(family.category).toBe('family');
    expect(medical.category).toBe('medical');
  });

  it('refuses to drop the last access without confirmation', async () => {
    const caregiver = await bootstrap(
      'caregiver',
      `last-${Date.now()}@guardme.test`,
      'Ana',
    );
    const profile = await createProfile(caregiver, 'Solo', 'medical');
    const members = payload<Array<{ accessId: string }>>(
      await request(http(app))
        .get(`/v1/profiles/${profile.id}/memberships`)
        .set('Authorization', bearer(caregiver))
        .expect(200),
    );
    const denied = await request(http(app))
      .delete(`/v1/profiles/${profile.id}/memberships/${members[0]?.accessId}`)
      .set('Authorization', bearer(caregiver));
    expect(denied.status).toBe(409);
    expect(
      payload<{ error: { details: { reason: string } } }>(denied).error.details
        .reason,
    ).toBe('last_access');
    await request(http(app))
      .delete(
        `/v1/profiles/${profile.id}/memberships/${members[0]?.accessId}?confirmLast=true`,
      )
      .set('Authorization', bearer(caregiver))
      .expect(204);
  });

  async function runCategory(category: 'family' | 'medical') {
    const ownerSession = await bootstrap(
      'caregiver',
      `${category}-a-${Date.now()}@guardme.test`,
      'Ana',
    );
    const guest = await bootstrap(
      'caregiver',
      `${category}-b-${Date.now()}@guardme.test`,
      'Bea',
    );
    const profile = await createProfile(ownerSession, category, category);
    const statuses: number[] = [];
    const invite = await request(http(app))
      .post(`/v1/profiles/${profile.id}/invitations`)
      .set('Authorization', bearer(ownerSession))
      .send({});
    statuses.push(invite.status);
    const accepted = await request(http(app))
      .post('/v1/invitations/accept')
      .set('Authorization', bearer(guest))
      .send({
        secret: payload<{ secret: string }>(invite).secret,
        caregiverCategory: category,
      });
    statuses.push(accepted.status);
    const listed = await request(http(app))
      .get('/v1/profiles')
      .set('Authorization', bearer(guest));
    statuses.push(listed.status);
    const detail = await request(http(app))
      .get(`/v1/profiles/${profile.id}`)
      .set('Authorization', bearer(guest));
    statuses.push(detail.status);
    const members = await request(http(app))
      .get(`/v1/profiles/${profile.id}/memberships`)
      .set('Authorization', bearer(guest));
    statuses.push(members.status);
    const progress = await request(http(app))
      .get(`/v1/onboarding?profileId=${profile.id}`)
      .set('Authorization', bearer(guest));
    statuses.push(progress.status);
    return {
      statuses,
      relation: payload<{ myRelation: string }>(detail).myRelation,
      category: payload<{ caregiverCategory: string }>(accepted)
        .caregiverCategory,
    };
  }

  async function bootstrap(
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

  async function createProfile(
    token: string,
    displayName: string,
    category: 'family' | 'medical',
  ): Promise<{ id: string }> {
    const response = await request(http(app))
      .post('/v1/profiles')
      .set('Authorization', bearer(token))
      .set('Idempotency-Key', `profile-${displayName}-${Date.now()}`)
      .send({
        displayName,
        relation: 'caregiver',
        caregiverCategory: category,
      })
      .expect(201);
    return payload<{ id: string }>(response);
  }
});

function bearer(token: string): string {
  return `Bearer ${token}`;
}
