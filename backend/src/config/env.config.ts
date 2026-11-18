import 'reflect-metadata';
import { Transform, Type, plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsInt,
  IsNumber,
  IsString,
  ValidateIf,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  NotContains,
  ValidateBy,
  validateSync,
  type ValidationError,
} from 'class-validator';

function asBoolean(value: unknown): unknown {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PORT: number;

  @IsString()
  @MinLength(32)
  @NotContains('replace-with')
  BETTER_AUTH_SECRET: string;

  @IsUrl({ require_tld: false })
  BETTER_AUTH_URL: string;

  @Matches(/^postgres(ql)?:\/\/\S+$/)
  DATABASE_URL_AUTH: string;

  @Matches(/^postgres(ql)?:\/\/\S+$/)
  DATABASE_URL_API: string;

  @Matches(/^postgres(ql)?:\/\/\S+$/)
  DATABASE_URL_ONBOARDING: string;

  @Matches(/^postgres(ql)?:\/\/\S+$/)
  DATABASE_URL_WORKER: string;

  @IsString()
  @MinLength(32)
  @NotContains('replace-with')
  SECRET_PEPPER: string;

  @IsIn(['fake', 'fcm'])
  PUSH_PROVIDER: string;

  @ValidateIf((env: EnvironmentVariables) => env.PUSH_PROVIDER === 'fcm')
  @IsString()
  @MinLength(2)
  FCM_SERVICE_ACCOUNT_JSON?: string;

  @IsIn(['fake', 'none', 'twilio'])
  TELEPHONY_PROVIDER: string;

  @ValidateIf((env: EnvironmentVariables) => env.TELEPHONY_PROVIDER === 'fake')
  @IsString()
  @MinLength(16)
  @NotContains('replace-with')
  FAKE_TELEPHONY_WEBHOOK_SECRET?: string;

  @ValidateIf((env: EnvironmentVariables) => env.TELEPHONY_PROVIDER === 'twilio')
  @IsString()
  @MinLength(34)
  @Matches(/^AC[0-9a-fA-F]{32}$/)
  TWILIO_ACCOUNT_SID?: string;

  @ValidateIf((env: EnvironmentVariables) => env.TELEPHONY_PROVIDER === 'twilio')
  @IsString()
  @MinLength(16)
  @NotContains('replace-with')
  TWILIO_AUTH_TOKEN?: string;

  @ValidateIf((env: EnvironmentVariables) => env.TELEPHONY_PROVIDER === 'twilio')
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/)
  TWILIO_FROM_NUMBER?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  TWILIO_ANSWER_TWIML?: string;

  @Matches(/^postgres(ql)?:\/\/\S+$/)
  DATABASE_URL_INGEST: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PD04_CALL_RING_TIMEOUT_SEC: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  PD04_CALL_PAUSE_BETWEEN_ATTEMPTS_SEC: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PD03_HUMAN_CONFIRM_TIMEOUT_SEC: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PD06_POSTPONE_REMINDER_SEC: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PD06_POSTPONE_COLLECTIVE_SEC: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PD07_FOLLOWUP_USER_WINDOW_SEC: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PD07_FOLLOWUP_CAREGIVER_WINDOW_SEC: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PD07_FOLLOWUP_LAST_WINDOW_SEC: number;

  @Transform(({ value }) => asBoolean(value))
  @IsBoolean()
  PD08_USER_CAN_EDIT_CAREGIVER_REMINDERS: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  OCCURRENCE_HORIZON_DAYS: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PD08_OCCURRENCE_SNOOZE_SEC: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PD10_MAX_INCIDENT_AGE_FOR_CALLS_SEC: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PD10_EVENT_RECEIPT_RETENTION_DAYS: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  CANE_LINK_FRESH_SEC: number;

  @Transform(({ value }) => asBoolean(value))
  @IsBoolean()
  PD12_CANE_PROXIMITY_PROOF_REQUIRED: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  FOLLOWUP_FIRST_LOCAL_HOUR: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  FOLLOWUP_LAST_DELAY_DAYS: number;

  @ValidateBy({
    name: 'isIanaTimeZone',
    validator: {
      validate: (value: unknown) => {
        if (typeof value !== 'string' || value.length === 0) return false;
        try {
          Intl.DateTimeFormat(undefined, { timeZone: value });
          return true;
        } catch {
          return false;
        }
      },
      defaultMessage: () => 'DEFAULT_PROFILE_TIME_ZONE no es una zona IANA',
    },
  })
  DEFAULT_PROFILE_TIME_ZONE: string;

  @IsString()
  @MinLength(2)
  @MaxLength(2)
  DEFAULT_PHONE_REGION: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  INVITATION_TTL_HOURS: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  ENROLLMENT_CODE_TTL_MIN: number;

  @Type(() => Number)
  @IsInt()
  @Min(100)
  RELAY_INTERVAL_MS: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  ACTION_LEASE_SEC: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  ACTION_TIMEOUT_SEC: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  WORKER_CONCURRENCY: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  INCIDENT_NOTIFICATION_TTL_SEC: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  IDEMPOTENCY_KEY_RETENTION_DAYS: number;

  @Transform(({ value }) => asBoolean(value))
  @IsBoolean()
  LOCATION_ENABLED: boolean;

  @IsString()
  @MinLength(16)
  HEALTH_DETAILS_TOKEN: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  HEALTH_WORKER_STALE_SEC: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  HEALTH_QUEUE_STALE_SEC: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  HEALTH_PUSH_FAIL_RATIO: number;
}

function formatErrors(errors: ValidationError[]): string {
  return errors
    .map((error) => {
      const messages = Object.values(error.constraints ?? {});
      return `${error.property}: ${messages.join(', ') || 'inválida'}`;
    })
    .join('; ');
}

export function validateEnv(
  input: Record<string, unknown>,
): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, input, {
    enableImplicitConversion: false,
  });
  const errors = validateSync(env, {
    skipMissingProperties: false,
    whitelist: true,
  });
  if (errors.length > 0) {
    throw new Error(`Variables de entorno inválidas: ${formatErrors(errors)}`);
  }
  return env;
}
