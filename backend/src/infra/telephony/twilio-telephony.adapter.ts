import { ConfigService } from '@nestjs/config';
import { DomainError } from '../../common/errors/domain-error';
import {
  TelephonyPort,
  type CreateCallInput,
  type CreateCallResult,
  type ParsedProviderEvent,
  type ProviderCallSnapshot,
  type ProviderCallStatus,
} from './telephony.port';

const TWILIO_STATUS_MAP: Record<string, ProviderCallStatus> = {
  queued: 'queued',
  initiated: 'queued',
  ringing: 'ringing',
  'in-progress': 'answered',
  completed: 'completed',
  busy: 'busy',
  'no-answer': 'no_answer',
  canceled: 'canceled',
  failed: 'failed',
};

const DEFAULT_TWIML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<Response><Say language="es-MX">Alerta GuardMe. Hay un incidente con la persona que cuida. Abra la aplicación para confirmar.</Say><Pause length="15"/></Response>';

interface TwilioCallRow {
  providerRef: string;
  status: ProviderCallStatus;
  at: Date;
}

/**
 * Adaptador PSTN vía Twilio REST (sin SDK).
 * Sin StatusCallback: el estado se obtiene por polling (RECONCILE_CALL_ATTEMPT → findCallByAttempt).
 */
export class TwilioTelephonyAdapter extends TelephonyPort {
  readonly provider = 'twilio';
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;
  private readonly twiml: string;
  private readonly fetchImpl: typeof fetch;
  /** attemptId → CallSid / último estado (reconciliación). */
  private readonly byAttempt = new Map<string, TwilioCallRow>();

  constructor(
    config: ConfigService,
    fetchImpl: typeof fetch = fetch,
  ) {
    super();
    this.fetchImpl = fetchImpl;
    this.accountSid = config.getOrThrow<string>('TWILIO_ACCOUNT_SID');
    this.authToken = config.getOrThrow<string>('TWILIO_AUTH_TOKEN');
    this.fromNumber = config.getOrThrow<string>('TWILIO_FROM_NUMBER');
    this.twiml =
      config.get<string>('TWILIO_ANSWER_TWIML')?.trim() || DEFAULT_TWIML;
  }

  async createCall(input: CreateCallInput): Promise<CreateCallResult> {
    const form = new URLSearchParams();
    form.set('To', input.to);
    form.set('From', this.fromNumber);
    form.set('Twiml', this.twiml);
    form.set(
      'Timeout',
      String(Math.max(5, Math.min(600, input.ringTimeoutSec))),
    );

    try {
      const response = await this.fetchImpl(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Calls.json`,
        {
          method: 'POST',
          headers: {
            Authorization: this.basicAuth(),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        sid?: string;
        status?: string;
        message?: string;
        code?: number;
      } | null;
      if (!response.ok || !payload?.sid) {
        if (response.status >= 500) {
          return {
            status: 'uncertain',
            error: payload?.message ?? `twilio_http_${response.status}`,
          };
        }
        return {
          status: 'rejected',
          error: payload?.message ?? `twilio_http_${response.status}`,
        };
      }
      const status = mapTwilioCallStatus(payload.status ?? 'queued');
      this.byAttempt.set(input.attemptId, {
        providerRef: payload.sid,
        status,
        at: new Date(),
      });
      return { status: 'requested', providerRef: payload.sid };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'network_error';
      return { status: 'uncertain', error: message };
    }
  }

  async findCallByAttempt(
    attemptId: string,
  ): Promise<ProviderCallSnapshot | null> {
    const local = this.byAttempt.get(attemptId);
    if (!local) return null;
    try {
      const response = await this.fetchImpl(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Calls/${local.providerRef}.json`,
        { headers: { Authorization: this.basicAuth() } },
      );
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`twilio_http_${response.status}`);
      }
      const payload = (await response.json()) as {
        sid?: string;
        status?: string;
        date_updated?: string;
      };
      const status = mapTwilioCallStatus(payload.status ?? local.status);
      const at = payload.date_updated
        ? new Date(payload.date_updated)
        : new Date();
      const snapshot = {
        providerRef: payload.sid ?? local.providerRef,
        status,
        at: Number.isNaN(at.getTime()) ? new Date() : at,
      };
      this.byAttempt.set(attemptId, snapshot);
      return snapshot;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('twilio_http_')) {
        throw error;
      }
      return { ...local };
    }
  }

  async cancelCall(providerRef: string): Promise<void> {
    const form = new URLSearchParams({ Status: 'canceled' });
    const response = await this.fetchImpl(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Calls/${providerRef}.json`,
      {
        method: 'POST',
        headers: {
          Authorization: this.basicAuth(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`twilio_cancel_http_${response.status}`);
    }
    for (const [attemptId, row] of this.byAttempt) {
      if (row.providerRef === providerRef) {
        this.byAttempt.set(attemptId, {
          ...row,
          status: 'canceled',
          at: new Date(),
        });
      }
    }
  }

  verifyAndParseWebhook(
    _headers: Record<string, string>,
    _rawBody: Buffer,
  ): ParsedProviderEvent[] {
    // Sin StatusCallback: no hay webhooks. El estado llega por reconcile/polling.
    throw new DomainError('UNAUTHENTICATED');
  }

  private basicAuth(): string {
    return `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`;
  }
}

export function mapTwilioCallStatus(raw: string): ProviderCallStatus {
  const mapped = TWILIO_STATUS_MAP[raw.toLowerCase()];
  if (!mapped) return 'failed';
  return mapped;
}
