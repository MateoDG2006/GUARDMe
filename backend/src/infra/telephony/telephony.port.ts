export const PROVIDER_CALL_STATUSES = [
  'queued',
  'ringing',
  'answered',
  'human_confirmed',
  'completed',
  'busy',
  'no_answer',
  'failed',
  'canceled',
] as const;

export type ProviderCallStatus = (typeof PROVIDER_CALL_STATUSES)[number];

export interface CreateCallInput {
  attemptId: string;
  to: string;
  ringTimeoutSec: number;
  incidentId: string;
}

export type CreateCallResult =
  | { status: 'requested'; providerRef: string }
  | { status: 'rejected'; error: string }
  | { status: 'uncertain'; error: string };

export interface ProviderCallSnapshot {
  providerRef: string;
  status: ProviderCallStatus;
  at: Date;
}

export interface ParsedProviderEvent {
  eventKey: string;
  providerRef: string;
  status: ProviderCallStatus;
  sequence: number | null;
  providerTimestamp: Date | null;
}

export abstract class TelephonyPort {
  abstract readonly provider: string;
  abstract createCall(input: CreateCallInput): Promise<CreateCallResult>;
  abstract findCallByAttempt(
    attemptId: string,
  ): Promise<ProviderCallSnapshot | null>;
  abstract cancelCall(providerRef: string): Promise<void>;
  abstract verifyAndParseWebhook(
    headers: Record<string, string>,
    rawBody: Buffer,
  ): ParsedProviderEvent[];
}

export function assertTelephonyAllowed(
  nodeEnv: string,
  provider: string,
): void {
  if (nodeEnv === 'production' && provider === 'fake') {
    throw new Error(
      'El adaptador falso de telefonía no se registra en producción',
    );
  }
}
