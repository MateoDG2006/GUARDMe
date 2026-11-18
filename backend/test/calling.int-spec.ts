import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  hashSecret,
  normalizeEnrollmentCode,
} from '../src/common/secrets/secret-codes';
import { FakeClock } from '../src/infra/clock/fake-clock';
import { signFakeWebhook } from '../src/infra/telephony/fake-telephony.adapter';
import type { ProviderCallStatus } from '../src/infra/telephony/telephony.port';
import { createEmailSession } from './helpers/auth-sessions';
import { createApiApp, http, payload } from './helpers/api-app';
import { truncateGuardme } from './helpers/db-reset';
import {
  createWorkerHarness,
  type WorkerHarness,
} from './helpers/worker-harness';

const CODE = 'ABCDE-FGHJK';
const SECRET = 'fake-telephony-webhook-secret';

describe('calling plan', () => {
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
    worker.telephony.createdAttemptIds.splice(0);
    await truncateGuardme(worker.owner);
    await worker.owner.$executeRaw`
      INSERT INTO guardme.canes (serial, model, claim_secret_hash)
      VALUES ('GM-4001', 'proto-esp32', ${hashSecret(normalizeEnrollmentCode(CODE))})
    `;
  });

  it('[T10] asks four attempts in order and then requires escalation', async () => {
    const scene = await sceneWithContacts();
    const incidentId = await activate(scene);
    const seen: number[] = [];
    for (let step = 0; step < 4; step += 1) {
      clock.set(new Date(clock.now().getTime() + 6_000));
      await worker.runDue();
      const active = await activeCount(incidentId);
      expect(active).toBe(1);
      const attempt = await currentAttempt(incidentId);
      seen.push(attempt.ordinal);
      await postEvent(attempt.provider_ref, 'no_answer', `na-${step}`);
      await worker.runDue();
      expect(await activeCount(incidentId)).toBe(0);
    }
    expect(seen).toEqual([1, 2, 3, 4]);
    clock.set(new Date(clock.now().getTime() + 6_000));
    await worker.runDue();
    const detail = await incidentDetail(scene.userToken, incidentId);
    expect(detail.status).toBe('escalation_required');
    expect(detail.escalationReason).toBe('attempts_exhausted');
    expect(detail.capabilities.emergencyAutoCall).toBe('not_enabled');
    expect(
      detail.calls.every((call) => !call.contactPhoneMasked.includes('911')),
    ).toBe(true);
  });

  it('[T11] cancels the remaining attempts after a human confirmation', async () => {
    const scene = await sceneWithContacts();
    const incidentId = await activate(scene);
    clock.set(new Date(clock.now().getTime() + 6_000));
    await worker.runDue();
    const first = await currentAttempt(incidentId);
    await postEvent(first.provider_ref, 'no_answer', 'na-1');
    await worker.runDue();
    clock.set(new Date(clock.now().getTime() + 6_000));
    await worker.runDue();
    const second = await currentAttempt(incidentId);
    await postEvent(second.provider_ref, 'answered', 'answered-2');
    await worker.runDue();
    await postEvent(second.provider_ref, 'human_confirmed', 'human-2');
    await worker.runDue();
    const attempts = await allAttempts(incidentId);
    expect(attempts.find((row) => row.ordinal === 2)?.status).toBe(
      'human_confirmed',
    );
    expect(
      attempts.filter((row) => row.ordinal > 2).map((row) => row.status),
    ).toEqual(['canceled', 'canceled']);
    expect(attempts.some((row) => row.ordinal > 2 && row.requested_at)).toBe(
      false,
    );
  });

  it('[T12] continues after an unconfirmed answer', async () => {
    const scene = await sceneWithContacts();
    const incidentId = await activate(scene);
    clock.set(new Date(clock.now().getTime() + 6_000));
    await worker.runDue();
    const attempt = await currentAttempt(incidentId);
    await postEvent(attempt.provider_ref, 'answered', 'answered-1');
    await worker.runDue();
    clock.set(new Date(clock.now().getTime() + 120_000));
    await worker.runDue();
    await worker.runDue();
    const attempts = await allAttempts(incidentId);
    expect(attempts.find((row) => row.ordinal === 1)?.status).toBe(
      'answered_unconfirmed',
    );
    expect(attempts.find((row) => row.ordinal === 2)?.status).toBe(
      'requesting',
    );
    const detail = await incidentDetail(scene.userToken, incidentId);
    expect(
      detail.events.some((event) => event.type === 'caregiver_informed'),
    ).toBe(false);
  });

  it('reconciles an uncertain create without a second call', async () => {
    const scene = await sceneWithContacts();
    const incidentId = await activate(scene);
    worker.telephony.failNextCreate('uncertain_but_created');
    clock.set(new Date(clock.now().getTime() + 6_000));
    await worker.runDue();
    expect(worker.telephony.createdAttemptIds).toHaveLength(1);
    const uncertain = await currentAttempt(incidentId);
    expect(uncertain.status).toBe('uncertain');
    clock.set(new Date(clock.now().getTime() + 11_000));
    await worker.runDue();
    expect(worker.telephony.createdAttemptIds).toHaveLength(1);
    const recovered = await currentAttempt(incidentId);
    expect(recovered.provider_ref).toEqual(expect.any(String));
  });

  it('[T30] keeps one provider event and ignores a late webhook', async () => {
    const scene = await sceneWithContacts();
    const incidentId = await activate(scene);
    clock.set(new Date(clock.now().getTime() + 6_000));
    await worker.runDue();
    const attempt = await currentAttempt(incidentId);
    await postEvent(attempt.provider_ref, 'no_answer', 'same-key');
    await postEvent(attempt.provider_ref, 'no_answer', 'same-key');
    await postEvent(attempt.provider_ref, 'no_answer', 'same-key');
    await worker.runDue();
    await postEvent(attempt.provider_ref, 'ringing', 'late-ring');
    await worker.runDue();
    const events = await worker.owner.$queryRaw<
      Array<{ event_key: string; apply_result: string }>
    >`
      SELECT event_key, apply_result FROM guardme.provider_events ORDER BY received_at
    `;
    expect(events.filter((row) => row.event_key === 'same-key')).toHaveLength(
      1,
    );
    expect(
      (await allAttempts(incidentId)).find((row) => row.ordinal === 1)?.status,
    ).toBe('no_answer');
    const version = (await incidentDetail(scene.careToken, incidentId)).version;
    await request(http(app))
      .post(`/v1/incidents/${incidentId}/decisions`)
      .set('Authorization', bearer(scene.careToken))
      .set('Idempotency-Key', `take-${stamp()}`)
      .send({ option: 'take_charge', expectedVersion: version })
      .expect(201);
    await postEvent(attempt.provider_ref, 'answered', 'after-close');
    await worker.runDue();
    const closed = await worker.owner.$queryRaw<
      Array<{ apply_result: string; status: string }>
    >`
      SELECT e.apply_result, i.status
      FROM guardme.provider_events e
      JOIN guardme.incidents i ON i.id = ${incidentId}::uuid
      WHERE e.event_key = 'after-close'
    `;
    expect(closed[0]?.apply_result).toBe('ignored_closed');
    expect(closed[0]?.status).toBe('closed_assisted');
  });

  it('rejects a bad signature and stores nothing', async () => {
    const body = Buffer.from(JSON.stringify({ events: [] }));
    await request(http(app))
      .post('/v1/provider-events/fake')
      .set('content-type', 'application/json')
      .set('x-fake-signature', '00')
      .send(body.toString('utf8'))
      .expect(401);
    const rows = await worker.owner.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM guardme.provider_events
    `;
    expect(rows[0]?.n).toBe(0);
  });

  async function sceneWithContacts() {
    const user = await account(`user-${stamp()}@guardme.test`);
    const care = await account(`care-${stamp()}@guardme.test`);
    const profile = await createProfile(user.token);
    const userPhone = await install(
      user.token,
      '44444444-4444-4444-8444-444444444444',
    );
    await install(
      care.token,
      '55555555-5555-4555-8555-555555555555',
      'token-care',
    );
    const claimed = await request(http(app))
      .post('/v1/canes/claim')
      .set('Authorization', bearer(user.token))
      .send({ serial: 'GM-4001', claimCode: CODE, profileId: profile.id })
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
    const invite = payload<{ secret: string }>(
      await request(http(app))
        .post(`/v1/profiles/${profile.id}/invitations`)
        .set('Authorization', bearer(user.token))
        .send({})
        .expect(201),
    );
    await request(http(app))
      .post('/v1/invitations/accept')
      .set('Authorization', bearer(care.token))
      .send({ secret: invite.secret, caregiverCategory: 'family' })
      .expect(201);
    return {
      userToken: user.token,
      careToken: care.token,
      userPhone,
      caneId,
      profileId: profile.id,
    };
  }

  async function activate(scene: {
    userToken: string;
    userPhone: string;
    caneId: string;
  }) {
    const created = await request(http(app))
      .post('/v1/incidents')
      .set('Authorization', bearer(scene.userToken))
      .set('X-Installation-Id', scene.userPhone)
      .send({
        origin: 'fall_detected',
        sourceEventId: `fall-${stamp()}`,
        caneId: scene.caneId,
        reportedOccurredAt: clock.now().toISOString(),
        ageAtSendMs: 0,
        protocolVersion: '1',
      })
      .expect(201);
    return payload<{ id: string }>(created).id;
  }

  async function postEvent(
    providerRef: string | null,
    status: ProviderCallStatus,
    eventKey: string,
  ) {
    if (!providerRef) throw new Error('El intento no tiene referencia');
    const raw = Buffer.from(
      JSON.stringify({
        events: [
          {
            eventKey,
            providerRef,
            status,
            sequence: 1,
            timestamp: clock.now().toISOString(),
          },
        ],
      }),
    );
    await request(http(app))
      .post('/v1/provider-events/fake')
      .set('content-type', 'application/json')
      .set('x-fake-signature', signFakeWebhook(SECRET, raw))
      .send(raw.toString('utf8'))
      .expect(204);
  }

  async function currentAttempt(incidentId: string) {
    const rows = await allAttempts(incidentId);
    const active = rows.find((row) =>
      ['requesting', 'ringing', 'answered_transport', 'uncertain'].includes(
        row.status,
      ),
    );
    if (!active) throw new Error('No hay intento en curso');
    return active;
  }

  async function allAttempts(incidentId: string) {
    return worker.owner.$queryRaw<
      Array<{
        ordinal: number;
        status: string;
        provider_ref: string | null;
        requested_at: Date | null;
      }>
    >`
      SELECT ordinal, status, provider_ref, requested_at
      FROM guardme.call_attempts
      WHERE incident_id = ${incidentId}::uuid
      ORDER BY ordinal
    `;
  }

  async function activeCount(incidentId: string) {
    const rows = await worker.owner.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n
      FROM guardme.call_attempts
      WHERE incident_id = ${incidentId}::uuid
        AND status IN ('requesting', 'ringing', 'answered_transport', 'uncertain')
    `;
    return rows[0]?.n ?? 0;
  }

  async function incidentDetail(token: string, incidentId: string) {
    return payload<{
      status: string;
      escalationReason: string | null;
      version: number;
      capabilities: { emergencyAutoCall: string };
      calls: Array<{ contactPhoneMasked: string }>;
      events: Array<{ type: string }>;
    }>(
      await request(http(app))
        .get(`/v1/incidents/${incidentId}`)
        .set('Authorization', bearer(token))
        .expect(200),
    );
  }

  async function account(email: string) {
    const session = await createEmailSession(email, 'password-1234');
    await request(http(app))
      .post('/v1/accounts/bootstrap')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        onboardingKind: email.startsWith('care') ? 'caregiver' : 'self',
        displayName: 'Ada',
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
