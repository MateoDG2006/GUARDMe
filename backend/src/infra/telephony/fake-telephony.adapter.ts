import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { DomainError } from '../../common/errors/domain-error';
import {
  PROVIDER_CALL_STATUSES,
  TelephonyPort,
  type CreateCallInput,
  type CreateCallResult,
  type ParsedProviderEvent,
  type ProviderCallSnapshot,
  type ProviderCallStatus,
} from './telephony.port';

type ScriptedCreate = 'rejected' | 'uncertain' | 'uncertain_but_created';

interface StoredCall {
  providerRef: string;
  status: ProviderCallStatus;
  at: Date;
}

export class FakeTelephonyAdapter extends TelephonyPort {
  readonly provider = 'fake';
  readonly createdAttemptIds: string[] = [];
  private readonly calls = new Map<string, StoredCall>();
  private readonly scripted: ScriptedCreate[] = [];

  constructor(private readonly config: ConfigService) {
    super();
  }

  failNextCreate(kind: ScriptedCreate): void {
    this.scripted.push(kind);
  }

  createCall(input: CreateCallInput): Promise<CreateCallResult> {
    const script = this.scripted.shift();
    if (script === 'rejected') {
      return Promise.resolve({ status: 'rejected', error: 'rejected' });
    }
    const providerRef = `fake-${randomUUID()}`;
    const stored: StoredCall = {
      providerRef,
      status: 'queued',
      at: new Date(),
    };
    if (script === 'uncertain') {
      return Promise.resolve({ status: 'uncertain', error: 'uncertain' });
    }
    this.calls.set(input.attemptId, stored);
    this.createdAttemptIds.push(input.attemptId);
    if (script === 'uncertain_but_created') {
      return Promise.resolve({ status: 'uncertain', error: 'uncertain' });
    }
    return Promise.resolve({ status: 'requested', providerRef });
  }

  findCallByAttempt(attemptId: string): Promise<ProviderCallSnapshot | null> {
    const call = this.calls.get(attemptId);
    if (!call) return Promise.resolve(null);
    return Promise.resolve({ ...call });
  }

  cancelCall(providerRef: string): Promise<void> {
    for (const call of this.calls.values()) {
      if (call.providerRef === providerRef) call.status = 'canceled';
    }
    return Promise.resolve();
  }

  verifyAndParseWebhook(
    headers: Record<string, string>,
    rawBody: Buffer,
  ): ParsedProviderEvent[] {
    const secret = this.config.getOrThrow<string>(
      'FAKE_TELEPHONY_WEBHOOK_SECRET',
    );
    const provided = headers['x-fake-signature'] ?? '';
    const expected = signFakeWebhook(secret, rawBody);
    const left = Buffer.from(provided);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new DomainError('UNAUTHENTICATED');
    }
    const body: unknown = JSON.parse(rawBody.toString('utf8'));
    if (!isRecord(body) || !Array.isArray(body.events)) {
      throw new DomainError('VALIDATION_FAILED');
    }
    return body.events.map((event) => parseEvent(event));
  }

  async emit(providerRef: string, status: ProviderCallStatus): Promise<void> {
    const rawBody = Buffer.from(
      JSON.stringify({
        events: [
          {
            eventKey: `emit:${providerRef}:${status}:${randomUUID()}`,
            providerRef,
            status,
            sequence: null,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    );
    const secret = this.config.getOrThrow<string>(
      'FAKE_TELEPHONY_WEBHOOK_SECRET',
    );
    const port = this.config.getOrThrow<number>('PORT');
    await fetch(`http://127.0.0.1:${port}/v1/provider-events/fake`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-fake-signature': signFakeWebhook(secret, rawBody),
      },
      body: rawBody,
    });
  }
}

export function signFakeWebhook(secret: string, rawBody: Buffer): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

function parseEvent(value: unknown): ParsedProviderEvent {
  if (!isRecord(value)) throw new DomainError('VALIDATION_FAILED');
  const status = value.status;
  if (typeof status !== 'string' || !isProviderStatus(status)) {
    throw new DomainError('VALIDATION_FAILED');
  }
  if (
    typeof value.eventKey !== 'string' ||
    typeof value.providerRef !== 'string'
  ) {
    throw new DomainError('VALIDATION_FAILED');
  }
  const timestamp =
    typeof value.timestamp === 'string' ? new Date(value.timestamp) : null;
  return {
    eventKey: value.eventKey,
    providerRef: value.providerRef,
    status,
    sequence: typeof value.sequence === 'number' ? value.sequence : null,
    providerTimestamp:
      timestamp && !Number.isNaN(timestamp.getTime()) ? timestamp : null,
  };
}

function isProviderStatus(value: string): value is ProviderCallStatus {
  return (PROVIDER_CALL_STATUSES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
