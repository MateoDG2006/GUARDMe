import { ConfigService } from '@nestjs/config';
import { DomainError } from '../../common/errors/domain-error';
import {
  FakeTelephonyAdapter,
  signFakeWebhook,
} from './fake-telephony.adapter';

describe('FakeTelephonyAdapter', () => {
  const secret = 'fake-telephony-webhook-secret';
  const config = {
    getOrThrow: (key: string) => {
      if (key === 'FAKE_TELEPHONY_WEBHOOK_SECRET') return secret;
      throw new Error(key);
    },
  } as ConfigService;
  const adapter = new FakeTelephonyAdapter(config);

  it('accepts a matching signature and rejects another', () => {
    const raw = Buffer.from(
      JSON.stringify({
        events: [
          {
            eventKey: 'e1',
            providerRef: 'fake-1',
            status: 'ringing',
            sequence: 1,
            timestamp: '2026-11-14T00:00:00.000Z',
          },
        ],
      }),
    );
    const events = adapter.verifyAndParseWebhook(
      { 'x-fake-signature': signFakeWebhook(secret, raw) },
      raw,
    );
    expect(events[0]?.status).toBe('ringing');
    expect(() =>
      adapter.verifyAndParseWebhook(
        { 'x-fake-signature': signFakeWebhook('other-secret-value', raw) },
        raw,
      ),
    ).toThrow(DomainError);
  });
});
