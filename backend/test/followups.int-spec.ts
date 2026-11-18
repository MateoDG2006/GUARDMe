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

const MORNING = new Date('2026-11-16T11:30:00.000Z');
const EVENING = new Date('2026-11-17T02:00:00.000Z');
const PUBLISH = '2026-11-17T12:00:00.000Z';
const LAST = '2026-11-20T12:00:00.000Z';

describe('followups', () => {
  let app: INestApplication;
  let worker: WorkerHarness;
  const clock = new FakeClock(MORNING);

  beforeAll(async () => {
    app = await createApiApp(clock);
    worker = await createWorkerHarness(clock);
  });

  afterAll(async () => {
    await worker?.close();
    await app?.close();
  });

  beforeEach(async () => {
    clock.set(MORNING);
    await truncateGuardme(worker.owner);
  });

  it('[T18] schedules the next Panama morning for an early and a late close', async () => {
    const early = await closeIncident(MORNING);
    const late = await closeIncident(EVENING);
    expect(early.publishAt).toBe(PUBLISH);
    expect(late.publishAt).toBe(PUBLISH);
  });

  it('[T19] asks the closing caregiver when the user does not answer', async () => {
    const scene = await closeIncident(MORNING);
    clock.set(new Date(PUBLISH));
    await worker.runDue();
    clock.set(new Date('2026-11-17T14:00:00.000Z'));
    const recipients = await publishedRound(scene.followupId, 'caregiver');
    const detail = await incident(scene.userToken, scene.incidentId);
    expect(detail.followup?.status).toBe('awaiting_caregiver');
    expect(recipients).toEqual([scene.careAccountId]);
  });

  it('[T20] schedules one last question three local mornings later', async () => {
    const scene = await closeIncident(MORNING);
    clock.set(new Date(PUBLISH));
    await worker.runDue();
    const question = await publishedQuestion(scene.userToken);
    await request(http(app))
      .post(`/v1/followup-questions/${question.questionId}/responses`)
      .set('Authorization', bearer(scene.userToken))
      .send({ option: 'not_well' })
      .expect(200);
    const rounds = await worker.owner.$queryRaw<
      Array<{ round: string; publish_at: Date }>
    >`
      SELECT round, publish_at
      FROM guardme.followup_questions
      WHERE followup_id = ${scene.followupId}::uuid
      ORDER BY publish_at
    `;
    expect(rounds.map((round) => round.round)).toEqual(['first', 'last']);
    expect(rounds[1]?.publish_at.toISOString()).toBe(LAST);
  });

  it('[T21] closes with encouragement or as inconclusive and leaves the incident closed', async () => {
    const encouraged = await answerLast('not_well');
    expect(encouraged.body).toMatchObject({
      applied: true,
      followupStatus: 'closed_encouraged',
      showEncouragement: true,
    });
    expect(
      (await incident(encouraged.scene.userToken, encouraged.scene.incidentId))
        .status,
    ).toBe('closed_assisted');
    const silent = await closeIncident(MORNING);
    await publishThroughLast(silent);
    clock.set(new Date('2026-11-20T14:00:00.000Z'));
    await worker.runDue();
    const detail = await incident(silent.userToken, silent.incidentId);
    expect(detail.status).toBe('closed_assisted');
    expect(detail.followup?.status).toBe('closed_inconclusive');
  });

  it('closes well and no_followup without another round', async () => {
    const well = await closeIncident(MORNING);
    clock.set(new Date(PUBLISH));
    await worker.runDue();
    const wellQuestion = await publishedQuestion(well.userToken);
    const wellBody = payload<{ followupStatus: string }>(
      await request(http(app))
        .post(`/v1/followup-questions/${wellQuestion.questionId}/responses`)
        .set('Authorization', bearer(well.userToken))
        .send({ option: 'well' })
        .expect(200),
    );
    expect(wellBody.followupStatus).toBe('closed_ok');
    const skipped = await closeIncident(MORNING);
    clock.set(new Date(PUBLISH));
    await worker.runDue();
    const skippedQuestion = await publishedQuestion(skipped.userToken);
    const skippedBody = payload<{ followupStatus: string }>(
      await request(http(app))
        .post(`/v1/followup-questions/${skippedQuestion.questionId}/responses`)
        .set('Authorization', bearer(skipped.userToken))
        .send({ option: 'no_followup_needed' })
        .expect(200),
    );
    expect(skippedBody.followupStatus).toBe('closed_no_followup');
  });

  it('does not create a second followup when take_charge is replayed', async () => {
    const scene = await closeIncident(MORNING);
    await request(http(app))
      .post(`/v1/incidents/${scene.incidentId}/decisions`)
      .set('Authorization', bearer(scene.careToken))
      .set('Idempotency-Key', stamp())
      .send({ option: 'take_charge', expectedVersion: scene.version })
      .expect(200);
    const rows = await worker.owner.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM guardme.followups
    `;
    expect(rows[0]?.n).toBe(1);
  });

  it('publishes the question once after the worker restarts', async () => {
    const scene = await closeIncident(MORNING);
    await worker.close();
    worker = await createWorkerHarness(clock);
    clock.set(new Date(PUBLISH));
    await worker.runDue();
    await worker.runDue();
    const rows = await worker.owner.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n
      FROM guardme.followup_questions
      WHERE followup_id = ${scene.followupId}::uuid
        AND status = 'published'
    `;
    expect(rows[0]?.n).toBe(1);
  });

  async function publishedRound(
    followupId: string,
    round: string,
  ): Promise<string[]> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await worker.runDue();
      const rows = await worker.owner.$queryRaw<
        Array<{ status: string; recipient_account_ids: string[] }>
      >`
        SELECT status, recipient_account_ids
        FROM guardme.followup_questions
        WHERE followup_id = ${followupId}::uuid
          AND round = ${round}
      `;
      const row = rows[0];
      if (row?.status === 'published') return row.recipient_account_ids;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`La ronda ${round} no se publicó`);
  }

  async function answerLast(option: 'not_well') {
    const scene = await closeIncident(MORNING);
    await publishThroughLast(scene);
    const question = await publishedQuestion(scene.userToken);
    const response = await request(http(app))
      .post(`/v1/followup-questions/${question.questionId}/responses`)
      .set('Authorization', bearer(scene.userToken))
      .send({ option })
      .expect(200);
    return { scene, body: payload(response) };
  }

  async function publishThroughLast(scene: Scene) {
    clock.set(new Date(PUBLISH));
    await worker.runDue();
    const question = await publishedQuestion(scene.userToken);
    await request(http(app))
      .post(`/v1/followup-questions/${question.questionId}/responses`)
      .set('Authorization', bearer(scene.userToken))
      .send({ option: 'not_well' })
      .expect(200);
    clock.set(new Date(LAST));
    await worker.runDue();
  }

  async function closeIncident(at: Date): Promise<Scene> {
    clock.set(at);
    const scene = await buildScene();
    const created = await request(http(app))
      .post('/v1/incidents')
      .set('Authorization', bearer(scene.userToken))
      .set('X-Installation-Id', scene.userPhone)
      .send({
        origin: 'manual_emergency',
        sourceEventId: `manual${stamp()}`,
        profileId: scene.profileId,
        reportedOccurredAt: at.toISOString(),
        protocolVersion: '1',
      })
      .expect(201);
    const opened = payload<{ id: string; version: number }>(created);
    const closed = await request(http(app))
      .post(`/v1/incidents/${opened.id}/decisions`)
      .set('Authorization', bearer(scene.careToken))
      .set('Idempotency-Key', stamp())
      .send({ option: 'take_charge', expectedVersion: opened.version })
      .expect(201);
    const followup = payload<{
      followup: { id: string; rounds: Array<{ publishAt: string }> } | null;
    }>(
      await request(http(app))
        .get(`/v1/incidents/${opened.id}`)
        .set('Authorization', bearer(scene.userToken))
        .expect(200),
    ).followup;
    return {
      ...scene,
      incidentId: opened.id,
      version: payload<{ incident: { version: number } }>(closed).incident
        .version,
      followupId: followup?.id ?? '',
      publishAt: followup?.rounds[0]?.publishAt ?? '',
    };
  }

  async function publishedQuestion(token: string) {
    const rows = payload<Array<{ questionId: string }>>(
      await request(http(app))
        .get('/v1/followups/pending')
        .set('Authorization', bearer(token))
        .expect(200),
    );
    const question = rows[0];
    if (!question) throw new Error('Sin pregunta publicada');
    return question;
  }

  async function incident(token: string, incidentId: string) {
    return payload<{
      status: string;
      followup: { status: string } | null;
    }>(
      await request(http(app))
        .get(`/v1/incidents/${incidentId}`)
        .set('Authorization', bearer(token))
        .expect(200),
    );
  }

  async function buildScene() {
    const user = await account(`user-${stamp()}@guardme.test`, 'Ada');
    const care = await account(`care-${stamp()}@guardme.test`, 'Care');
    const profile = payload<{ id: string }>(
      await request(http(app))
        .post('/v1/profiles')
        .set('Authorization', bearer(user.token))
        .set('Idempotency-Key', stamp())
        .send({ displayName: 'Persona', relation: 'user' })
        .expect(201),
    );
    const userPhone = payload<{ id: string }>(
      await request(http(app))
        .post('/v1/installations')
        .set('Authorization', bearer(user.token))
        .send({
          clientInstallationId: '99999999-9999-4999-8999-999999999999',
          platform: 'android',
          appVersion: '1.0.0',
        })
        .expect(201),
    ).id;
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
    const careAccount = await worker.owner.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM guardme.accounts WHERE display_name = 'Care'
    `;
    return {
      userToken: user.token,
      careToken: care.token,
      profileId: profile.id,
      userPhone,
      careAccountId: careAccount[0]?.id ?? '',
    };
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
});

interface Scene {
  userToken: string;
  careToken: string;
  profileId: string;
  userPhone: string;
  careAccountId: string;
  incidentId: string;
  version: number;
  followupId: string;
  publishAt: string;
}

function bearer(token: string): string {
  return `Bearer ${token}`;
}

function stamp(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1e9)}`;
}
