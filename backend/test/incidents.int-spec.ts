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

describe('incidents', () => {
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
      VALUES ('GM-1001', 'proto-esp32', ${hashSecret(normalizeEnrollmentCode(CODE))})
    `;
  });

  it('[T09] persists one fall, one activated event and one notification', async () => {
    const user = await linkedUser();
    const body = fall(user.caneId, 'boot-1');
    const created = await request(http(app))
      .post('/v1/incidents')
      .set('Authorization', bearer(user.token))
      .set('X-Installation-Id', user.installationId)
      .send(body)
      .expect(201);
    const incident = payload<{
      id: string;
      status: string;
      registration: string;
      notification: string;
    }>(created);
    expect(incident.registration).toBe('persisted');
    expect(incident.notification).toBe('scheduled');
    expect(incident.status).toBe('pending_contact');
    const replay = await request(http(app))
      .post('/v1/incidents')
      .set('Authorization', bearer(user.token))
      .set('X-Installation-Id', user.installationId)
      .send(body)
      .expect(200);
    expect(replay.headers['x-idempotent-replay']).toBe('true');
    expect(payload<{ id: string }>(replay).id).toBe(incident.id);
    expect(await count('incidents')).toBe(1);
    expect(await count("incident_events WHERE type = 'activated'")).toBe(1);
    expect(await count("pending_actions WHERE type = 'NOTIFY_INCIDENT'")).toBe(
      1,
    );
    const listed = payload<{ items: Array<{ id: string }> }>(
      await request(http(app))
        .get(`/v1/profiles/${user.profileId}/incidents`)
        .set('Authorization', bearer(user.token))
        .expect(200),
    );
    expect(listed.items.map((item) => item.id)).toEqual([incident.id]);
  });

  it('[T14] schedules a manual emergency without a call', async () => {
    const user = await linkedUser();
    const created = await request(http(app))
      .post('/v1/incidents')
      .set('Authorization', bearer(user.token))
      .set('X-Installation-Id', user.installationId)
      .send({
        origin: 'manual_emergency',
        sourceEventId: 'manual-1',
        profileId: user.profileId,
        reportedOccurredAt: NOW.toISOString(),
        protocolVersion: '1',
      })
      .expect(201);
    const incident = payload<{
      id: string;
      status: string;
      escalationReason: string;
      notification: string;
    }>(created);
    expect(incident.status).toBe('escalation_required');
    expect(incident.escalationReason).toBe('manual_request');
    expect(incident.notification).toBe('scheduled');
    expect(JSON.stringify(created.body).includes('conectada')).toBe(false);
    expect(await count("pending_actions WHERE type = 'NOTIFY_INCIDENT'")).toBe(
      1,
    );
    expect(
      await count("pending_actions WHERE type = 'START_NEXT_CALL_ATTEMPT'"),
    ).toBe(0);
  });

  it('keeps a single row when the same fall arrives ten times at once', async () => {
    const user = await linkedUser();
    const body = fall(user.caneId, 'race-1');
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(http(app))
          .post('/v1/incidents')
          .set('Authorization', bearer(user.token))
          .set('X-Installation-Id', user.installationId)
          .send(body),
      ),
    );
    expect(responses.filter((item) => item.status === 201)).toHaveLength(1);
    expect(responses.filter((item) => item.status === 200)).toHaveLength(9);
    expect(await count('incidents')).toBe(1);
  });

  it('marks an old fall as delayed and does not start calls', async () => {
    const user = await linkedUser();
    const created = await request(http(app))
      .post('/v1/incidents')
      .set('Authorization', bearer(user.token))
      .set('X-Installation-Id', user.installationId)
      .send({ ...fall(user.caneId, 'late-1'), ageAtSendMs: 601_000 })
      .expect(201);
    const incident = payload<{ status: string; isDelayed: boolean }>(created);
    expect(incident.status).toBe('delayed_review');
    expect(incident.isDelayed).toBe(true);
    expect(
      await count("incident_events WHERE type = 'delayed_registered'"),
    ).toBe(1);
    expect(
      await count("pending_actions WHERE type = 'START_NEXT_CALL_ATTEMPT'"),
    ).toBe(0);
    const payloadText = await owner.$queryRaw<Array<{ payload: string }>>`
      SELECT payload::text AS payload FROM guardme.pending_actions
    `;
    expect(
      payloadText.some(
        (row) =>
          row.payload.includes('"delayed":true') ||
          row.payload.includes('"delayed": true'),
      ),
    ).toBe(true);
  });

  it('rejects a fall from an installation that is not the gateway', async () => {
    const user = await linkedUser();
    const other = await install(
      user.token,
      '22222222-2222-4222-8222-222222222222',
    );
    const denied = await request(http(app))
      .post('/v1/incidents')
      .set('Authorization', bearer(user.token))
      .set('X-Installation-Id', other)
      .send(fall(user.caneId, 'foreign-1'));
    expect(denied.status).toBe(403);
    expect(
      payload<{ error: { details: { reason: string } } }>(denied).error.details
        .reason,
    ).toBe('not_active_gateway');
    expect(await count('incidents')).toBe(0);
  });

  it('hides an incident from another profile and forbids a caregiver manual alert', async () => {
    const user = await linkedUser();
    const created = await request(http(app))
      .post('/v1/incidents')
      .set('Authorization', bearer(user.token))
      .set('X-Installation-Id', user.installationId)
      .send(fall(user.caneId, 'private-1'))
      .expect(201);
    const incidentId = payload<{ id: string }>(created).id;
    const stranger = await account(
      'caregiver',
      `other-${Date.now()}@guardme.test`,
    );
    const strangerProfile = await createProfile(stranger.token, 'caregiver');
    const hidden = await request(http(app))
      .get(`/v1/incidents/${incidentId}`)
      .set('Authorization', bearer(stranger.token));
    expect(hidden.status).toBe(404);
    expect(strangerProfile.id).not.toBe(user.profileId);
    const caregiver = await account(
      'caregiver',
      `care-${Date.now()}@guardme.test`,
    );
    const invite = payload<{ secret: string }>(
      await request(http(app))
        .post(`/v1/profiles/${user.profileId}/invitations`)
        .set('Authorization', bearer(user.token))
        .send({})
        .expect(201),
    );
    await request(http(app))
      .post('/v1/invitations/accept')
      .set('Authorization', bearer(caregiver.token))
      .send({ secret: invite.secret, caregiverCategory: 'family' })
      .expect(201);
    const carePhone = await install(
      caregiver.token,
      '33333333-3333-4333-8333-333333333333',
    );
    const forbidden = await request(http(app))
      .post('/v1/incidents')
      .set('Authorization', bearer(caregiver.token))
      .set('X-Installation-Id', carePhone)
      .send({
        origin: 'manual_emergency',
        sourceEventId: 'care-1',
        profileId: user.profileId,
        reportedOccurredAt: NOW.toISOString(),
        protocolVersion: '1',
      });
    expect(forbidden.status).toBe(403);
  });

  async function linkedUser() {
    const user = await account(
      'self',
      `fall-${Date.now()}-${Math.floor(Math.random() * 1e6)}@guardme.test`,
    );
    const profile = await createProfile(user.token, 'user');
    const installationId = await install(
      user.token,
      '11111111-1111-4111-8111-111111111111',
    );
    const claimed = await request(http(app))
      .post('/v1/canes/claim')
      .set('Authorization', bearer(user.token))
      .send({ serial: 'GM-1001', claimCode: CODE, profileId: profile.id })
      .expect(201);
    const caneId = payload<{ id: string }>(claimed).id;
    await request(http(app))
      .post(`/v1/canes/${caneId}/gateway`)
      .set('Authorization', bearer(user.token))
      .set('X-Installation-Id', installationId)
      .expect(200);
    return { token: user.token, profileId: profile.id, installationId, caneId };
  }

  async function account(kind: 'self' | 'caregiver', email: string) {
    const session = await createEmailSession(email, 'password-1234');
    await request(http(app))
      .post('/v1/accounts/bootstrap')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ onboardingKind: kind, displayName: 'Ada' })
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

  function fall(caneId: string, sourceEventId: string) {
    return {
      origin: 'fall_detected',
      sourceEventId,
      caneId,
      reportedOccurredAt: NOW.toISOString(),
      ageAtSendMs: 0,
      protocolVersion: '1',
    };
  }

  async function count(from: string): Promise<number> {
    const rows = await owner.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM guardme.${from}`,
    );
    return rows[0]?.n ?? 0;
  }
});

function bearer(token: string): string {
  return `Bearer ${token}`;
}
