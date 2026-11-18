import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { FakeClock } from '../src/infra/clock/fake-clock';
import { createEmailSession } from './helpers/auth-sessions';
import { createApiApp, http, payload } from './helpers/api-app';
import { truncateGuardme } from './helpers/db-reset';
import {
  createWorkerHarness,
  type WorkerHarness,
} from './helpers/worker-harness';

const NOW = new Date('2026-11-16T15:00:00.000Z');

describe('reminders', () => {
  let app: INestApplication;
  let worker: WorkerHarness;
  const clock = new FakeClock(NOW);

  beforeAll(async () => {
    app = await createApiApp(clock);
    worker = await createWorkerHarness(clock);
  });

  afterAll(async () => {
    await worker?.close();
    await app?.close();
  });

  beforeEach(async () => {
    clock.set(NOW);
    await truncateGuardme(worker.owner);
  });

  it('creates Panama Monday and Wednesday occurrences once', async () => {
    const scene = await buildScene();
    const reminder = await createReminder(scene.userToken, scene.profileId);
    const window = await occurrences(scene.userToken, scene.profileId);
    expect(window.map((item) => item.scheduledFor)).toEqual([
      '2026-11-18T13:00:00.000Z',
      '2026-11-23T13:00:00.000Z',
    ]);
    await worker.horizon.extend(clock.now());
    const again = await occurrences(scene.userToken, scene.profileId);
    expect(again.map((item) => item.id)).toEqual(window.map((item) => item.id));
    expect(reminder.schedules).toHaveLength(1);
  });

  it('[T22] refuses a user delete of a caregiver reminder and blocks the role', async () => {
    const scene = await buildScene();
    const reminder = await createReminder(scene.careToken, scene.profileId);
    const denied = await request(http(app))
      .delete(
        `/v1/reminders/${reminder.id}?expectedVersion=${reminder.version}`,
      )
      .set('Authorization', bearer(scene.userToken));
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({
      error: {
        code: 'FORBIDDEN_ACTION',
        details: { reason: 'caregiver_authored' },
      },
    });
    const listed = await listReminders(scene.userToken, scene.profileId);
    expect(listed[0]?.status).toBe('active');
    expect(await occurrenceCount(reminder.id)).toBeGreaterThan(0);
    const audit = await worker.owner.$queryRaw<Array<{ result: string }>>`
      SELECT result FROM guardme.audit_log
      WHERE operation = 'reminder.delete'
      ORDER BY at DESC
      LIMIT 1
    `;
    expect(audit[0]?.result).toBe('denied');
    const user = await worker.owner.$queryRaw<
      Array<{ id: string; auth_user_id: string }>
    >`
      SELECT id, auth_user_id FROM guardme.accounts WHERE display_name = 'Ada'
    `;
    await expect(
      worker.owner.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT
            set_config('guardme.account_id', ${user[0]?.id ?? ''}, true),
            set_config('guardme.auth_user_id', ${user[0]?.auth_user_id ?? ''}, true),
            set_config('guardme.installation_id', '', true)
        `;
        await tx.$executeRaw`SET LOCAL ROLE guardme_api`;
        await tx.$executeRaw`
          UPDATE guardme.reminders
          SET status = 'inactive'
          WHERE id = ${reminder.id}::uuid
        `;
      }),
    ).rejects.toThrow();
  });

  it('lets the author and any caregiver deactivate a reminder', async () => {
    const scene = await buildScene();
    const own = await createReminder(scene.userToken, scene.profileId);
    await request(http(app))
      .delete(`/v1/reminders/${own.id}?expectedVersion=${own.version}`)
      .set('Authorization', bearer(scene.userToken))
      .expect(204);
    const authored = await createReminder(
      scene.userToken,
      scene.profileId,
      'Otra',
    );
    await request(http(app))
      .delete(
        `/v1/reminders/${authored.id}?expectedVersion=${authored.version}`,
      )
      .set('Authorization', bearer(scene.careToken))
      .expect(204);
  });

  it('[T23] returns a version conflict to the second editor', async () => {
    const scene = await buildScene();
    const reminder = await createReminder(scene.userToken, scene.profileId);
    const first = await request(http(app))
      .patch(`/v1/reminders/${reminder.id}`)
      .set('Authorization', bearer(scene.careToken))
      .send({ expectedVersion: reminder.version, title: 'Cambiado' });
    const second = await request(http(app))
      .patch(`/v1/reminders/${reminder.id}`)
      .set('Authorization', bearer(scene.userToken))
      .send({ expectedVersion: reminder.version, title: 'Otro' });
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const seenByUser = await listReminders(scene.userToken, scene.profileId);
    const seenByCare = await listReminders(scene.careToken, scene.profileId);
    expect(seenByUser[0]?.title).toBe(seenByCare[0]?.title);
    expect(seenByUser[0]?.title).toBe('Cambiado');
  });

  it('[T24] records the user response and refuses the caregiver', async () => {
    const scene = await buildScene();
    await createReminder(scene.userToken, scene.profileId);
    const [occurrence] = await occurrences(scene.userToken, scene.profileId);
    const taken = await request(http(app))
      .post(`/v1/occurrences/${occurrence?.id}/responses`)
      .set('Authorization', bearer(scene.userToken))
      .set('X-Installation-Id', scene.userPhone)
      .send({ response: 'taken', expectedVersion: occurrence?.version })
      .expect(200);
    expect(
      payload<{ status: string; respondedBy: string }>(taken),
    ).toMatchObject({
      status: 'taken',
      respondedBy: scene.userAccountId,
    });
    const refused = await request(http(app))
      .post(`/v1/occurrences/${occurrence?.id}/responses`)
      .set('Authorization', bearer(scene.careToken))
      .set('X-Installation-Id', scene.carePhone)
      .send({ response: 'taken', expectedVersion: occurrence?.version });
    expect(refused.status).toBe(501);
    expect(refused.body).toMatchObject({
      error: { code: 'CAPABILITY_NOT_ENABLED', details: { policy: 'PD-08' } },
    });
  });

  it('cancels future occurrences when the schedule changes and keeps past ones', async () => {
    const scene = await buildScene();
    const reminder = await createReminder(scene.userToken, scene.profileId);
    const before = await occurrences(scene.userToken, scene.profileId);
    await worker.owner.$executeRaw`
      UPDATE guardme.reminder_occurrences
      SET scheduled_for = ${new Date('2026-11-01T13:00:00.000Z')}::timestamptz
      WHERE id = ${before[0]?.id}::uuid
    `;
    await request(http(app))
      .patch(`/v1/reminders/${reminder.id}`)
      .set('Authorization', bearer(scene.userToken))
      .send({
        expectedVersion: reminder.version,
        schedules: [
          {
            localTime: '09:00',
            daysOfWeek: [5],
            timeZone: 'America/Panama',
            validFrom: '2026-11-01',
          },
        ],
      })
      .expect(200);
    const rows = await worker.owner.$queryRaw<
      Array<{
        status: string;
        cancel_reason: string | null;
        scheduled_for: Date;
      }>
    >`
      SELECT status, cancel_reason, scheduled_for
      FROM guardme.reminder_occurrences
      WHERE reminder_id = ${reminder.id}::uuid
      ORDER BY scheduled_for
    `;
    const past = rows.find(
      (row) => row.scheduled_for.toISOString() === '2026-11-01T13:00:00.000Z',
    );
    expect(past?.status).toBe('scheduled');
    expect(past?.cancel_reason).toBeNull();
    expect(
      rows
        .filter(
          (row) =>
            row.scheduled_for > NOW && row.cancel_reason === 'schedule_changed',
        )
        .every((row) => row.status === 'canceled'),
    ).toBe(true);
  });

  async function buildScene() {
    const user = await account(`user-${stamp()}@guardme.test`, 'Ada');
    const care = await account(`care-${stamp()}@guardme.test`, 'Care');
    const profile = await createProfile(user.token);
    const userPhone = await install(
      user.token,
      '99999999-9999-4999-8999-999999999999',
    );
    const carePhone = await install(
      care.token,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
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
    const userAccount = await worker.owner.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM guardme.accounts WHERE display_name = 'Ada'
    `;
    return {
      userToken: user.token,
      careToken: care.token,
      profileId: profile.id,
      userPhone,
      carePhone,
      userAccountId: userAccount[0]?.id ?? '',
    };
  }

  async function createReminder(
    token: string,
    profileId: string,
    title = 'Pastilla',
  ) {
    const response = await request(http(app))
      .post(`/v1/profiles/${profileId}/reminders`)
      .set('Authorization', bearer(token))
      .set('Idempotency-Key', `rem-${stamp()}`)
      .send({
        kind: 'medication',
        title,
        schedules: [
          {
            localTime: '08:00',
            daysOfWeek: [1, 3],
            timeZone: 'America/Panama',
            validFrom: '2026-11-01',
          },
        ],
      })
      .expect(201);
    return payload<{
      id: string;
      version: number;
      schedules: Array<{ id: string }>;
    }>(response);
  }

  function occurrences(token: string, profileId: string) {
    return request(http(app))
      .get(`/v1/profiles/${profileId}/occurrences`)
      .query({
        from: '2026-11-16T15:00:00.000Z',
        to: '2026-11-23T15:00:00.000Z',
      })
      .set('Authorization', bearer(token))
      .expect(200)
      .then((response) =>
        payload<Array<{ id: string; scheduledFor: string; version: number }>>(
          response,
        ),
      );
  }

  function listReminders(token: string, profileId: string) {
    return request(http(app))
      .get(`/v1/profiles/${profileId}/reminders`)
      .set('Authorization', bearer(token))
      .expect(200)
      .then((response) =>
        payload<Array<{ title: string; status: string }>>(response),
      );
  }

  async function occurrenceCount(reminderId: string) {
    const rows = await worker.owner.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n
      FROM guardme.reminder_occurrences
      WHERE reminder_id = ${reminderId}::uuid
    `;
    return rows[0]?.n ?? 0;
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

  async function install(token: string, clientInstallationId: string) {
    const response = await request(http(app))
      .post('/v1/installations')
      .set('Authorization', bearer(token))
      .send({
        clientInstallationId,
        platform: 'android',
        appVersion: '1.0.0',
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
