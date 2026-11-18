import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import {
  hashSecret,
  normalizeEnrollmentCode,
} from '../src/common/secrets/secret-codes';
import { createEmailSession } from './helpers/auth-sessions';
import { createApiApp, http, payload } from './helpers/api-app';
import { truncateGuardme } from './helpers/db-reset';

const CODE = 'ABCDE-FGHJK';
const PHONE_A = '+50761234567';
const PHONE_B = '+50762345678';

describe('devices and contacts', () => {
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
    await owner.$executeRaw`
      INSERT INTO guardme.canes (serial, model, claim_secret_hash)
      VALUES (
        'GM-0001',
        'proto-esp32',
        ${hashSecret(normalizeEnrollmentCode(CODE))}
      )
    `;
  });

  it('[T05] claims only with the right code and can move after release', async () => {
    const user = await account(
      'self',
      `cane-user-${Date.now()}@guardme.test`,
      'Ada',
    );
    const other = await account(
      'caregiver',
      `cane-other-${Date.now()}@guardme.test`,
      'Bea',
    );
    const profile = await createProfile(user.token, 'user');
    const otherProfile = await createProfile(other.token, 'caregiver');
    const wrong = await request(http(app))
      .post('/v1/canes/claim')
      .set('Authorization', bearer(user.token))
      .send({
        serial: 'GM-0001',
        claimCode: 'ZZZZZ-ZZZZZ',
        profileId: profile.id,
      });
    expect(wrong.status).toBe(404);
    const assigned = await owner.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM guardme.cane_assignments
    `;
    expect(assigned[0]?.n).toBe(0);

    const claimed = await request(http(app))
      .post('/v1/canes/claim')
      .set('Authorization', bearer(user.token))
      .send({
        serial: 'GM-0001',
        claimCode: 'abcde fghjk',
        profileId: profile.id,
      })
      .expect(201);
    const caneId = payload<{ id: string }>(claimed).id;
    const replay = await request(http(app))
      .post('/v1/canes/claim')
      .set('Authorization', bearer(user.token))
      .send({ serial: 'GM-0001', claimCode: CODE, profileId: profile.id })
      .expect(200);
    expect(payload<{ id: string }>(replay).id).toBe(caneId);

    const blocked = await request(http(app))
      .post('/v1/canes/claim')
      .set('Authorization', bearer(other.token))
      .send({
        serial: 'GM-0001',
        claimCode: CODE,
        profileId: otherProfile.id,
      });
    expect(blocked.status).toBe(409);
    expect(
      payload<{ error: { details: { reason: string } } }>(blocked).error.details
        .reason,
    ).toBe('assigned_elsewhere');
    await request(http(app))
      .post(`/v1/canes/${caneId}/release`)
      .set('Authorization', bearer(user.token))
      .expect(204);
    await request(http(app))
      .post('/v1/canes/claim')
      .set('Authorization', bearer(other.token))
      .send({ serial: 'GM-0001', claimCode: CODE, profileId: otherProfile.id })
      .expect(201);
    const hidden = payload<unknown[]>(
      await request(http(app))
        .get(`/v1/profiles/${profile.id}/canes`)
        .set('Authorization', bearer(user.token))
        .expect(200),
    );
    expect(hidden).toEqual([]);
  });

  it('keeps a single gateway and closes it when the installation is revoked', async () => {
    const user = await account(
      'self',
      `gw-user-${Date.now()}@guardme.test`,
      'Ada',
    );
    const caregiver = await account(
      'caregiver',
      `gw-care-${Date.now()}@guardme.test`,
      'Bea',
    );
    const profile = await createProfile(user.token, 'user');
    const invite = payload<{ secret: string }>(
      await request(http(app))
        .post(`/v1/profiles/${profile.id}/invitations`)
        .set('Authorization', bearer(user.token))
        .send({})
        .expect(201),
    );
    await request(http(app))
      .post('/v1/invitations/accept')
      .set('Authorization', bearer(caregiver.token))
      .send({ secret: invite.secret, caregiverCategory: 'family' })
      .expect(201);
    const caneId = payload<{ id: string }>(
      await request(http(app))
        .post('/v1/canes/claim')
        .set('Authorization', bearer(user.token))
        .send({ serial: 'GM-0001', claimCode: CODE, profileId: profile.id })
        .expect(201),
    ).id;
    const userPhone = await install(
      user.token,
      '11111111-1111-4111-8111-111111111111',
    );
    const secondPhone = await install(
      user.token,
      '22222222-2222-4222-8222-222222222222',
    );
    const carePhone = await install(
      caregiver.token,
      '33333333-3333-4333-8333-333333333333',
    );
    const denied = await request(http(app))
      .post(`/v1/canes/${caneId}/gateway`)
      .set('Authorization', bearer(caregiver.token))
      .set('X-Installation-Id', carePhone);
    expect(denied.status).toBe(403);
    await request(http(app))
      .post(`/v1/canes/${caneId}/gateway`)
      .set('Authorization', bearer(user.token))
      .set('X-Installation-Id', userPhone)
      .expect(200);
    await request(http(app))
      .post(`/v1/canes/${caneId}/gateway`)
      .set('Authorization', bearer(user.token))
      .set('X-Installation-Id', secondPhone)
      .expect(200);
    const gateways = await owner.$queryRaw<
      Array<{
        ended_at: Date | null;
        end_reason: string | null;
        installation_id: string;
      }>
    >`
      SELECT ended_at, end_reason, installation_id
      FROM guardme.gateways
      WHERE cane_id = ${caneId}::uuid
      ORDER BY started_at
    `;
    expect(gateways.filter((row) => row.ended_at === null)).toHaveLength(1);
    expect(gateways[0]?.end_reason).toBe('replaced');
    await request(http(app))
      .delete(`/v1/installations/${secondPhone}`)
      .set('Authorization', bearer(user.token))
      .expect(204);
    const closed = await owner.$queryRaw<Array<{ end_reason: string }>>`
      SELECT end_reason
      FROM guardme.gateways
      WHERE installation_id = ${secondPhone}::uuid
    `;
    expect(closed[0]?.end_reason).toBe('installation_revoked');
  });

  it('create with priority replaces the previous holder of that slot', async () => {
    const user = await account(
      'self',
      `contacts-prio-${Date.now()}@guardme.test`,
      'Ada',
    );
    const profile = await createProfile(user.token, 'user');
    const first = await request(http(app))
      .post(`/v1/profiles/${profile.id}/contacts`)
      .set('Authorization', bearer(user.token))
      .send({
        displayName: 'Viejo P1',
        phone: '6123-4567',
        priority: 1,
        expectedContactsVersion: 1,
      })
      .expect(201);
    const second = await request(http(app))
      .post(`/v1/profiles/${profile.id}/contacts`)
      .set('Authorization', bearer(user.token))
      .send({
        displayName: 'Nuevo P1',
        phone: '6234-5678',
        priority: 1,
        expectedContactsVersion: payload<{ contactsVersion: number }>(first)
          .contactsVersion,
      })
      .expect(201);
    const list = payload<{
      items: Array<{ displayName: string; priority: number | null }>;
    }>(second);
    const byName = Object.fromEntries(
      list.items.map((item) => [item.displayName, item.priority]),
    );
    expect(byName['Nuevo P1']).toBe(1);
    expect(byName['Viejo P1']).toBeNull();
  });

  it('reorders contacts atomically and rejects a stale version', async () => {
    const user = await account(
      'self',
      `contacts-${Date.now()}@guardme.test`,
      'Ada',
    );
    const profile = await createProfile(user.token, 'user');
    const first = await request(http(app))
      .post(`/v1/profiles/${profile.id}/contacts`)
      .set('Authorization', bearer(user.token))
      .send({
        displayName: 'Uno',
        phone: '6123-4567',
        priority: 1,
        expectedContactsVersion: 1,
      })
      .expect(201);
    const second = await request(http(app))
      .post(`/v1/profiles/${profile.id}/contacts`)
      .set('Authorization', bearer(user.token))
      .send({
        displayName: 'Dos',
        phone: '6234-5678',
        priority: 2,
        expectedContactsVersion: payload<{ contactsVersion: number }>(first)
          .contactsVersion,
      })
      .expect(201);
    const items = payload<{
      contactsVersion: number;
      items: Array<{ id: string; priority: number }>;
    }>(second);
    const swapped = await request(http(app))
      .patch(`/v1/profiles/${profile.id}/contacts`)
      .set('Authorization', bearer(user.token))
      .send({
        expectedContactsVersion: items.contactsVersion,
        items: [
          { id: items.items[0]?.id, priority: 2 },
          { id: items.items[1]?.id, priority: 1 },
        ],
      })
      .expect(200);
    const stranger = await request(http(app))
      .post(`/v1/profiles/${profile.id}/contacts`)
      .set('Authorization', bearer(user.token))
      .send({
        displayName: 'Ajena',
        phone: '6345-6789',
        linkedAccountId: '99999999-9999-4999-8999-999999999999',
        expectedContactsVersion: payload<{ contactsVersion: number }>(swapped)
          .contactsVersion,
      });
    expect(stranger.status).toBe(400);
    const stale = await request(http(app))
      .patch(`/v1/profiles/${profile.id}/contacts`)
      .set('Authorization', bearer(user.token))
      .send({
        expectedContactsVersion: 1,
        items: items.items.map((item) => ({
          id: item.id,
          priority: item.priority,
        })),
      });
    expect(stale.status).toBe(409);
    expect(
      payload<{ error: { details: { current: { items: unknown[] } } } }>(stale)
        .error.details.current.items,
    ).toHaveLength(2);
    const audit = await owner.$queryRaw<Array<{ details: string }>>`
      SELECT details::text AS details FROM guardme.audit_log
    `;
    const blob = audit.map((row) => row.details).join('\n');
    expect(blob.includes(PHONE_A)).toBe(false);
    expect(blob.includes(PHONE_B)).toBe(false);
  });

  async function account(
    kind: 'self' | 'caregiver',
    email: string,
    displayName: string,
  ) {
    const session = await createEmailSession(email, 'password-1234');
    await request(http(app))
      .post('/v1/accounts/bootstrap')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ onboardingKind: kind, displayName })
      .expect(201);
    return { token: session.accessToken };
  }

  async function createProfile(token: string, relation: 'user' | 'caregiver') {
    const response = await request(http(app))
      .post('/v1/profiles')
      .set('Authorization', bearer(token))
      .set(
        'Idempotency-Key',
        `profile-${relation}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
      )
      .send(
        relation === 'user'
          ? { displayName: 'Persona', relation }
          : { displayName: 'Otro', relation, caregiverCategory: 'family' },
      )
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

function bearer(token: string): string {
  return `Bearer ${token}`;
}
