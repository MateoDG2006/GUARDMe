import {
  mapTwilioCallStatus,
  TwilioTelephonyAdapter,
} from './twilio-telephony.adapter';
import { ConfigService } from '@nestjs/config';
import { DomainError } from '../../common/errors/domain-error';

describe('mapTwilioCallStatus', () => {
  it('maps Twilio statuses to provider statuses', () => {
    expect(mapTwilioCallStatus('ringing')).toBe('ringing');
    expect(mapTwilioCallStatus('in-progress')).toBe('answered');
    expect(mapTwilioCallStatus('no-answer')).toBe('no_answer');
    expect(mapTwilioCallStatus('completed')).toBe('completed');
    expect(mapTwilioCallStatus('weird')).toBe('failed');
  });
});

describe('TwilioTelephonyAdapter', () => {
  const config = {
    getOrThrow: (key: string) => {
      const values: Record<string, string> = {
        TWILIO_ACCOUNT_SID: 'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        TWILIO_AUTH_TOKEN: 'auth-token',
        TWILIO_FROM_NUMBER: '+15005550006',
      };
      if (!(key in values)) throw new Error(key);
      return values[key];
    },
    get: () => undefined,
  } as unknown as ConfigService;

  it('creates a call without StatusCallback and returns providerRef', async () => {
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = String(init?.body);
      expect(body).toContain('To=%2B50761000101');
      expect(body).not.toContain('StatusCallback');
      return new Response(JSON.stringify({ sid: 'CA123', status: 'queued' }), {
        status: 201,
      });
    };
    const adapter = new TwilioTelephonyAdapter(config, fetchImpl);
    const result = await adapter.createCall({
      attemptId: 'attempt-1',
      to: '+50761000101',
      ringTimeoutSec: 30,
      incidentId: 'inc-1',
    });
    expect(result).toEqual({ status: 'requested', providerRef: 'CA123' });
  });

  it('polls call status via findCallByAttempt', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith('/Calls.json')) {
        return new Response(
          JSON.stringify({ sid: 'CA123', status: 'queued' }),
          { status: 201 },
        );
      }
      return new Response(
        JSON.stringify({
          sid: 'CA123',
          status: 'in-progress',
          date_updated: '2026-11-17T20:00:00Z',
        }),
        { status: 200 },
      );
    };
    const adapter = new TwilioTelephonyAdapter(config, fetchImpl);
    await adapter.createCall({
      attemptId: 'attempt-1',
      to: '+50761000101',
      ringTimeoutSec: 30,
      incidentId: 'inc-1',
    });
    const snapshot = await adapter.findCallByAttempt('attempt-1');
    expect(snapshot).toEqual({
      providerRef: 'CA123',
      status: 'answered',
      at: new Date('2026-11-17T20:00:00Z'),
    });
  });

  it('rejects webhooks (no StatusCallback)', () => {
    const adapter = new TwilioTelephonyAdapter(config);
    expect(() =>
      adapter.verifyAndParseWebhook(
        { 'x-twilio-signature': 'anything' },
        Buffer.from('CallSid=CA123&CallStatus=ringing'),
      ),
    ).toThrow(DomainError);
  });
});
