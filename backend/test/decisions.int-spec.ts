import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  hashSecret,
  normalizeEnrollmentCode,
} from '../src/common/secrets/secret-codes';
import { FakeClock } from '../src/infra/clock/fake-clock';
import { createEmailSession } from './helpers/auth-sessions';
import { createApiApp, http, payload } from './helpers/api-app';
import { truncateGuardme } from './helpers/db-reset';
import {
  createWorkerHarness,
  type WorkerHarness,
} from './helpers/worker-harness';

const CODE = 'ABCDE-FGHJK';

describe('caregiver decisions', () => {
  let app: INestApplication;
  let worker: WorkerHarness;
  const clock = new FakeClock(new Date());

  beforeAll(async () => {
    app = await createApiApp(clock);
    worker = await createWorkerHarness(clock);
  });

  afterAll(async () => {
    await worker?.close();
    await app?.close();
  });

  beforeEach(async () => {
    clock.set(new Date());
    await truncateGuardme(worker.owner);
    await worker.owner.$executeRaw`
      INSERT INTO guardme.canes (serial, model, claim_secret_hash)
      VALUES ('GM-4002', 'proto-esp32', ${hashSecret(normalizeEnrollmentCode(CODE))})
    `;
  });

  it('rejects take_charge from the user relation', async () => {
    const built = await buildScene();
    const incidentId = await activate(built);
    const detail = await incident(built.userToken, incidentId);
    await request(http(app))
      .post(`/v1/incidents/${incidentId}/decisions`)
      .set('Authorization', bearer(built.userToken))
      .set('Idempotency-Key', `user-${stamp()}`)
      .send({ option: 'take_charge', expectedVersion: detail.version })
      .expect(403);
  });

  it('[T15] keeps a single close when two caregivers take charge', async () => {
    const built = await buildScene(true);
    const incidentId = await activate(built);
    const detail = await incident(built.userToken, incidentId);
    const results = await Promise.all([
      request(http(app))
        .post(`/v1/incidents/${incidentId}/decisions`)
        .set('Authorization', bearer(built.careToken))
        .set('Idempotency-Key', `a-${stamp()}`)
        .send({ option: 'take_charge', expectedVersion: detail.version }),
      request(http(app))
        .post(`/v1/incidents/${incidentId}/decisions`)
        .set('Authorization', bearer(built.secondToken))
        .set('Idempotency-Key', `b-${stamp()}`)
        .send({ option: 'take_charge', expectedVersion: detail.version }),
    ]);
    const statuses = results.map((result) => result.status).sort();
    expect(statuses).toEqual([201, 409]);
    const rows = await worker.owner.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n
      FROM guardme.caregiver_decisions
      WHERE incident_id = ${incidentId}::uuid
        AND option = 'take_charge'
    `;
    expect(rows[0]?.n).toBe(1);
    expect((await incident(built.userToken, incidentId)).status).toBe(
      'closed_assisted',
    );
  });

  it('[T16] reminds only the caregiver who postponed', async () => {
    const built = await buildScene(true);
    const incidentId = await activate(built);
    const detail = await incident(built.careToken, incidentId);
    await request(http(app))
      .post(`/v1/incidents/${incidentId}/decisions`)
      .set('Authorization', bearer(built.careToken))
      .set('Idempotency-Key', `post-${stamp()}`)
      .send({ option: 'postpone', expectedVersion: detail.version })
      .expect(201);
    clock.set(new Date(clock.now().getTime() + 300_000));
    await worker.drain();
    const notes = await worker.owner.$queryRaw<
      Array<{ type: string; recipient_account_id: string }>
    >`
      SELECT type, recipient_account_id
      FROM guardme.notifications
      WHERE type = 'postpone_reminder'
    `;
    expect(notes).toHaveLength(1);
    const accounts = await worker.owner.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM guardme.accounts WHERE display_name = 'Care'
    `;
    expect(notes[0]?.recipient_account_id).toBe(accounts[0]?.id);
  });

  it('[T17] notifies every caregiver at two hours without new calls', async () => {
    const built = await buildScene(true);
    const incidentId = await activate(built);
    const before = await worker.owner.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM guardme.call_attempts WHERE incident_id = ${incidentId}::uuid
    `;
    const detail = await incident(built.careToken, incidentId);
    await request(http(app))
      .post(`/v1/incidents/${incidentId}/decisions`)
      .set('Authorization', bearer(built.careToken))
      .set('Idempotency-Key', `post-${stamp()}`)
      .send({ option: 'postpone', expectedVersion: detail.version })
      .expect(201);
    clock.set(new Date(clock.now().getTime() + 7_200_000));
    await worker.drain();
    const notes = await worker.owner.$queryRaw<
      Array<{ recipient_account_id: string }>
    >`
      SELECT recipient_account_id
      FROM guardme.notifications
      WHERE type = 'postpone_collective'
    `;
    expect(notes).toHaveLength(2);
    const after = await worker.owner.$queryRaw<
      Array<{ n: number; status: string }>
    >`
      SELECT
        (SELECT count(*)::int FROM guardme.call_attempts WHERE incident_id = ${incidentId}::uuid) AS n,
        status
      FROM guardme.incidents
      WHERE id = ${incidentId}::uuid
    `;
    expect(after[0]?.n).toBe(before[0]?.n);
    expect(after[0]?.status).toBe('attention_postponed');
  });

  async function buildScene(second = false) {
    const user = await account(`user-${stamp()}@guardme.test`, 'Ada');
    const care = await account(`care-${stamp()}@guardme.test`, 'Care');
    const other = second
      ? await account(`care2-${stamp()}@guardme.test`, 'Bea')
      : null;
    const profile = await createProfile(user.token);
    const userPhone = await install(
      user.token,
      '66666666-6666-4666-8666-666666666666',
    );
    await install(
      care.token,
      '77777777-7777-4777-8777-777777777777',
      'token-care',
    );
    if (other) {
      await install(
        other.token,
        '88888888-8888-4888-8888-888888888888',
        'token-bea',
      );
    }
    const claimed = await request(http(app))
      .post('/v1/canes/claim')
      .set('Authorization', bearer(user.token))
      .send({ serial: 'GM-4002', claimCode: CODE, profileId: profile.id })
      .expect(201);
    const caneId = payload<{ id: string }>(claimed).id;
    await request(http(app))
      .post(`/v1/canes/${caneId}/gateway`)
      .set('Authorization', bearer(user.token))
      .set('X-Installation-Id', userPhone)
      .expect(200);
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
    await request(http(app))
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
    for (const token of [care.token, other?.token].filter(
      (value): value is string => !!value,
    )) {
      const invite = payload<{ secret: string }>(
        await request(http(app))
          .post(`/v1/profiles/${profile.id}/invitations`)
          .set('Authorization', bearer(user.token))
          .send({})
          .expect(201),
      );
      await request(http(app))
        .post('/v1/invitations/accept')
        .set('Authorization', bearer(token))
        .send({ secret: invite.secret, caregiverCategory: 'family' })
        .expect(201);
    }
    return {
      userToken: user.token,
      careToken: care.token,
      secondToken: other?.token ?? '',
      userPhone,
      caneId,
    };
  }

  async function activate(sceneValue: {
    userToken: string;
    userPhone: string;
    caneId: string;
  }) {
    const created = await request(http(app))
      .post('/v1/incidents')
      .set('Authorization', bearer(sceneValue.userToken))
      .set('X-Installation-Id', sceneValue.userPhone)
      .send({
        origin: 'fall_detected',
        sourceEventId: `fall-${stamp()}`,
        caneId: sceneValue.caneId,
        reportedOccurredAt: clock.now().toISOString(),
        ageAtSendMs: 0,
        protocolVersion: '1',
      })
      .expect(201);
    return payload<{ id: string }>(created).id;
  }

  async function incident(token: string, incidentId: string) {
    return payload<{ version: number; status: string }>(
      await request(http(app))
        .get(`/v1/incidents/${incidentId}`)
        .set('Authorization', bearer(token))
        .expect(200),
    );
  }

  async function account(email: string, displayName: string) {
    const session = await createEmailSession(email, 'password-1234');
    await request(http(app))
      .post('/v1/accounts/bootstrap')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        onboardingKind: email.startsWith('care') ? 'caregiver' : 'self',
        displayName,
      })
      .expect(201);
    return { token: session.accessToken };
  }

  async function createProfile(token: string) {
    const response = await request(http(app))
      .post('/v1/profiles')
      .set('Authorization', bearer(token))
      .set('Idempotency-Key', `profile-${stamp()}`)
      .send({ displayName: 'Persona', relation: 'user' })
      .expect(201);
    return payload<{ id: string }>(response);
  }

  async function install(
    token: string,
    clientInstallationId: string,
    pushToken?: string,
  ) {
    const response = await request(http(app))
      .post('/v1/installations')
      .set('Authorization', bearer(token))
      .send({
        clientInstallationId,
        platform: 'android',
        appVersion: '1.0.0',
        ...(pushToken ? { pushToken } : {}),
      })
      .expect(201);
    return payload<{ id: string }>(response).id;
  }
});

function bearer(token: string): string {
  return `Bearer ${token}`;
}

function stamp(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1e9)}`;
}
