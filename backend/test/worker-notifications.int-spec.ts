import { Logger, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  hashSecret,
  normalizeEnrollmentCode,
} from '../src/common/secrets/secret-codes';
import { createEmailSession } from './helpers/auth-sessions';
import { createApiApp, http, payload } from './helpers/api-app';
import { truncateGuardme } from './helpers/db-reset';
import {
  createWorkerHarness,
  type WorkerHarness,
} from './helpers/worker-harness';

const CODE = 'ABCDE-FGHJK';

describe('worker notifications', () => {
  let app: INestApplication;
  let worker: WorkerHarness;

  beforeAll(async () => {
    app = await createApiApp();
    worker = await createWorkerHarness();
  });

  afterAll(async () => {
    await worker?.close();
    await app?.close();
  });

  beforeEach(async () => {
    worker.clock.set(new Date());
    worker.push.sent.splice(0, worker.push.sent.length);
    await truncateGuardme(worker.owner);
    await worker.owner.$executeRaw`
      INSERT INTO guardme.canes (serial, model, claim_secret_hash)
      VALUES ('GM-3001', 'proto-esp32', ${hashSecret(normalizeEnrollmentCode(CODE))})
    `;
  });

  it('pushes one high-priority message per caregiver installation', async () => {
    const scene = await sceneWithCaregiver(true);
    const incidentId = await activate(scene);
    await worker.drain();
    const messages = worker.push.sent.filter(
      (message) => message.type === 'incident_fall',
    );
    expect(messages).toHaveLength(2);
    expect(messages.every((message) => message.priority === 'high')).toBe(true);
    expect(
      messages.every((message) => message.collapseKey === incidentId),
    ).toBe(true);
    expect(new Set(messages.map((message) => message.token)).size).toBe(2);
  });

  it('[T27] shows acceptance without receipt or attention', async () => {
    const scene = await sceneWithCaregiver(false);
    const incidentId = await activate(scene);
    await worker.drain();
    const detail = payload<{
      notifications: Array<{
        acceptedAt: string | null;
        receivedAt: string | null;
        openedAt: string | null;
      }>;
    }>(
      await request(http(app))
        .get(`/v1/incidents/${incidentId}`)
        .set('Authorization', bearer(scene.userToken))
        .expect(200),
    );
    expect(detail.notifications[0]?.acceptedAt).toEqual(expect.any(String));
    expect(detail.notifications[0]?.receivedAt).toBeNull();
    expect(detail.notifications[0]?.openedAt).toBeNull();
    expect(JSON.stringify(detail).includes('leído')).toBe(false);
    expect(JSON.stringify(detail).includes('atendido')).toBe(false);

    const received = await request(http(app))
      .post(`/v1/notifications/${await notificationId(scene)}/acknowledgements`)
      .set('Authorization', bearer(scene.careToken))
      .set('X-Installation-Id', scene.carePhone)
      .send({ kind: 'received' })
      .expect(201);
    expect(payload<{ receivedAt: string | null }>(received).receivedAt).toEqual(
      expect.any(String),
    );
    const opened = await request(http(app))
      .post(`/v1/notifications/${await notificationId(scene)}/acknowledgements`)
      .set('Authorization', bearer(scene.careToken))
      .set('X-Installation-Id', scene.carePhone)
      .send({ kind: 'opened' })
      .expect(201);
    expect(payload<{ openedAt: string | null }>(opened).openedAt).toEqual(
      expect.any(String),
    );
    const foreign = await request(http(app))
      .post(`/v1/notifications/${await notificationId(scene)}/acknowledgements`)
      .set('Authorization', bearer(scene.userToken))
      .set('X-Installation-Id', scene.userPhone)
      .send({ kind: 'received' });
    expect(foreign.status).toBe(404);
  });

  it('[T29] sends a queued incident once when the worker starts draining', async () => {
    const scene = await sceneWithCaregiver(false);
    await activate(scene);
    await worker.drain();
    await worker.drain();
    expect(
      worker.push.sent.filter((message) => message.type === 'incident_fall'),
    ).toHaveLength(1);
  });

  it('reclaims an expired lease without a second push', async () => {
    const scene = await sceneWithCaregiver(false);
    await activate(scene);
    await worker.drain();
    expect(
      worker.push.sent.filter((message) => message.type === 'incident_fall'),
    ).toHaveLength(1);
    await worker.owner.$executeRaw`
      UPDATE guardme.pending_actions
      SET status = 'running',
          lease_until = ${new Date(worker.clock.now().getTime() - 1000)}
      WHERE id = (
        SELECT p.id
        FROM guardme.pending_actions p
        JOIN guardme.notifications n ON n.id = p.resource_id
        WHERE p.type = 'SEND_NOTIFICATION'
          AND n.type = 'incident_fall'
        LIMIT 1
      )
    `;
    await worker.runDue();
    expect(
      worker.push.sent.filter((message) => message.type === 'incident_fall'),
    ).toHaveLength(1);
  });

  it('discards the notification when the caregiver is revoked before delivery', async () => {
    const scene = await sceneWithCaregiver(false);
    await activate(scene);
    worker.clock.set(new Date());
    await worker.runDue();
    await request(http(app))
      .delete(
        `/v1/profiles/${scene.profileId}/memberships/${scene.careAccessId}`,
      )
      .set('Authorization', bearer(scene.userToken))
      .expect(204);
    await worker.drain();
    expect(worker.push.sent).toHaveLength(0);
    const rows = await worker.owner.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM guardme.notifications
    `;
    expect(rows[0]?.status).toBe('discarded');
  });

  it('clears an invalid push token', async () => {
    const scene = await sceneWithCaregiver(false);
    await activate(scene);
    worker.push.failNext('token_invalid');
    await worker.drain();
    const tokens = await worker.owner.$queryRaw<
      Array<{ push_token: string | null }>
    >`
      SELECT push_token
      FROM guardme.installations
      WHERE id = ${scene.carePhone}::uuid
    `;
    expect(tokens[0]?.push_token).toBeNull();
  });

  it('fails the action after five retryable pushes', async () => {
    const scene = await sceneWithCaregiver(false);
    await activate(scene);
    await worker.owner.$executeRaw`
      UPDATE guardme.pending_actions
      SET status = 'discarded'
      WHERE type IN ('NOTIFY_INCIDENT_UPDATE', 'SYNC_SIGNAL')
    `;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      worker.push.failNext('retryable');
    }
    const errors = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    await worker.drain();
    const rows = await worker.owner.$queryRaw<
      Array<{ status: string; attempts: number }>
    >`
      SELECT p.status, p.attempts
      FROM guardme.pending_actions p
      JOIN guardme.notifications n ON n.id = p.resource_id
      WHERE p.type = 'SEND_NOTIFICATION'
        AND n.type = 'incident_fall'
    `;
    expect(rows[0]?.status).toBe('failed');
    expect(rows[0]?.attempts).toBe(5);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it('does not let the worker create tables in pgboss', async () => {
    await expect(
      worker.owner.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL ROLE guardme_worker`;
        await tx.$executeRaw`CREATE TABLE pgboss.worker_must_not_create (id int)`;
      }),
    ).rejects.toThrow();
  });

  async function sceneWithCaregiver(secondPhone: boolean) {
    const user = await account(`user-${stamp()}@guardme.test`);
    const care = await account(`care-${stamp()}@guardme.test`);
    const profile = await createProfile(user.token);
    const userPhone = await install(
      user.token,
      '11111111-1111-4111-8111-111111111111',
    );
    const carePhone = await install(
      care.token,
      '22222222-2222-4222-8222-222222222222',
      'token-care-1',
    );
    if (secondPhone) {
      await install(
        care.token,
        '33333333-3333-4333-8333-333333333333',
        'token-care-2',
      );
    }
    const claimed = await request(http(app))
      .post('/v1/canes/claim')
      .set('Authorization', bearer(user.token))
      .send({ serial: 'GM-3001', claimCode: CODE, profileId: profile.id })
      .expect(201);
    const caneId = payload<{ id: string }>(claimed).id;
    await request(http(app))
      .post(`/v1/canes/${caneId}/gateway`)
      .set('Authorization', bearer(user.token))
      .set('X-Installation-Id', userPhone)
      .expect(200);
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
    const members = payload<Array<{ accessId: string; relation: string }>>(
      await request(http(app))
        .get(`/v1/profiles/${profile.id}/memberships`)
        .set('Authorization', bearer(user.token))
        .expect(200),
    );
    const careAccessId = members.find(
      (member) => member.relation === 'caregiver',
    )?.accessId;
    if (!careAccessId) throw new Error('Falta el acceso del cuidador');
    return {
      userToken: user.token,
      careToken: care.token,
      profileId: profile.id,
      userPhone,
      carePhone,
      caneId,
      careAccessId,
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
        reportedOccurredAt: new Date().toISOString(),
        ageAtSendMs: 0,
        protocolVersion: '1',
      })
      .expect(201);
    return payload<{ id: string }>(created).id;
  }

  async function notificationId(scene: { careToken: string }): Promise<string> {
    const listed = payload<{ items: Array<{ id: string }> }>(
      await request(http(app))
        .get('/v1/notifications')
        .set('Authorization', bearer(scene.careToken))
        .expect(200),
    );
    const id = listed.items[0]?.id;
    if (!id) throw new Error('Falta la notificación');
    return id;
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
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}
