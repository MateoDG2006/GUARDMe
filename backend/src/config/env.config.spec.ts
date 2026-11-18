import { validateEnv } from './env.config';

function validEnv(): Record<string, unknown> {
  return {
    NODE_ENV: 'test',
    PORT: '3000',
    BETTER_AUTH_SECRET: 'local-dev-better-auth-secret-32b!',
    BETTER_AUTH_URL: 'http://localhost:3000',
    DATABASE_URL_AUTH:
      'postgresql://guardme_auth:guardme_auth_dev@127.0.0.1:54322/postgres',
    DATABASE_URL_API:
      'postgresql://guardme_api:guardme_api_dev@127.0.0.1:54322/postgres',
    DATABASE_URL_ONBOARDING:
      'postgresql://guardme_onboarding:guardme_onboarding_dev@127.0.0.1:54322/postgres',
    DATABASE_URL_WORKER:
      'postgresql://guardme_worker:guardme_worker_dev@127.0.0.1:54322/postgres',
    SECRET_PEPPER: 'local-dev-secret-pepper-32b-ok!!',
    PUSH_PROVIDER: 'fake',
    TELEPHONY_PROVIDER: 'fake',
    FAKE_TELEPHONY_WEBHOOK_SECRET: 'fake-telephony-webhook-secret',
    DATABASE_URL_INGEST:
      'postgresql://guardme_ingest:guardme_ingest_dev@127.0.0.1:54322/postgres',
    PD04_CALL_RING_TIMEOUT_SEC: '30',
    PD04_CALL_PAUSE_BETWEEN_ATTEMPTS_SEC: '5',
    PD03_HUMAN_CONFIRM_TIMEOUT_SEC: '120',
    PD06_POSTPONE_REMINDER_SEC: '300',
    PD06_POSTPONE_COLLECTIVE_SEC: '7200',
    PD07_FOLLOWUP_USER_WINDOW_SEC: '7200',
    PD07_FOLLOWUP_CAREGIVER_WINDOW_SEC: '7200',
    PD07_FOLLOWUP_LAST_WINDOW_SEC: '7200',
    PD08_USER_CAN_EDIT_CAREGIVER_REMINDERS: 'false',
    OCCURRENCE_HORIZON_DAYS: '7',
    PD08_OCCURRENCE_SNOOZE_SEC: '600',
    PD10_MAX_INCIDENT_AGE_FOR_CALLS_SEC: '600',
    PD10_EVENT_RECEIPT_RETENTION_DAYS: '30',
    CANE_LINK_FRESH_SEC: '300',
    PD12_CANE_PROXIMITY_PROOF_REQUIRED: 'false',
    FOLLOWUP_FIRST_LOCAL_HOUR: '7',
    FOLLOWUP_LAST_DELAY_DAYS: '3',
    DEFAULT_PROFILE_TIME_ZONE: 'America/Panama',
    DEFAULT_PHONE_REGION: 'PA',
    INVITATION_TTL_HOURS: '72',
    ENROLLMENT_CODE_TTL_MIN: '15',
    RELAY_INTERVAL_MS: '1000',
    ACTION_LEASE_SEC: '120',
    ACTION_TIMEOUT_SEC: '60',
    WORKER_CONCURRENCY: '4',
    INCIDENT_NOTIFICATION_TTL_SEC: '3600',
    IDEMPOTENCY_KEY_RETENTION_DAYS: '7',
    LOCATION_ENABLED: 'true',
    HEALTH_DETAILS_TOKEN: 'health-details-token',
    HEALTH_WORKER_STALE_SEC: '60',
    HEALTH_QUEUE_STALE_SEC: '60',
    HEALTH_PUSH_FAIL_RATIO: '0.2',
  };
}

describe('validateEnv', () => {
  it('names the missing variable', () => {
    expect(() => validateEnv({})).toThrow(/PORT/);
  });

  it('keeps the string false as boolean false', () => {
    const env = validateEnv(validEnv());
    expect(env.PORT).toBe(3000);
    expect(env.PD08_USER_CAN_EDIT_CAREGIVER_REMINDERS).toBe(false);
    expect(env.PD12_CANE_PROXIMITY_PROOF_REQUIRED).toBe(false);
    expect(env.DEFAULT_PROFILE_TIME_ZONE).toBe('America/Panama');
  });

  it('rejects placeholder secrets', () => {
    expect(() =>
      validateEnv({
        ...validEnv(),
        SECRET_PEPPER: 'replace-with-32-byte-random-secret-value',
      }),
    ).toThrow(/SECRET_PEPPER/);
  });

  it('allows telephony none without fake webhook secret', () => {
    const { FAKE_TELEPHONY_WEBHOOK_SECRET: _, ...rest } = validEnv();
    const env = validateEnv({ ...rest, TELEPHONY_PROVIDER: 'none' });
    expect(env.TELEPHONY_PROVIDER).toBe('none');
  });

  it('requires Twilio credentials when TELEPHONY_PROVIDER=twilio', () => {
    const { FAKE_TELEPHONY_WEBHOOK_SECRET: _, ...rest } = validEnv();
    expect(() =>
      validateEnv({ ...rest, TELEPHONY_PROVIDER: 'twilio' }),
    ).toThrow(/TWILIO/);
    const env = validateEnv({
      ...rest,
      TELEPHONY_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      TWILIO_AUTH_TOKEN: 'twilio-auth-token-ok',
      TWILIO_FROM_NUMBER: '+15005550006',
    });
    expect(env.TELEPHONY_PROVIDER).toBe('twilio');
  });
});
