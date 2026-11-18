import { generateKeyPairSync } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { assertPushAllowed } from './push.port';
import {
  buildFcmMessageBody,
  FcmPushAdapter,
  mapFcmHttpError,
} from './fcm-push.adapter';

describe('mapFcmHttpError', () => {
  it('maps token, retryable and terminal errors', () => {
    expect(mapFcmHttpError(404, 'UNREGISTERED').status).toBe('token_invalid');
    expect(mapFcmHttpError(400, 'INVALID_ARGUMENT').status).toBe('failed');
    expect(mapFcmHttpError(503, 'UNAVAILABLE').status).toBe('retryable');
    expect(mapFcmHttpError(429, undefined).status).toBe('retryable');
    expect(mapFcmHttpError(500, undefined).status).toBe('retryable');
    expect(mapFcmHttpError(403, 'SENDER_ID_MISMATCH').status).toBe('failed');
  });
});

describe('buildFcmMessageBody', () => {
  it('builds the HTTP v1 message shape', () => {
    expect(
      buildFcmMessageBody({
        token: 'tok',
        notificationId: 'n1',
        type: 'incident_fall',
        priority: 'high',
        ttlSeconds: 3600,
        collapseKey: 'fall',
        title: 'Alerta',
        body: 'Posible caída',
        data: { notificationId: 'n1' },
      }),
    ).toEqual({
      message: {
        token: 'tok',
        data: { notificationId: 'n1' },
        notification: { title: 'Alerta', body: 'Posible caída' },
        android: {
          priority: 'HIGH',
          ttl: '3600s',
          collapse_key: 'fall',
          notification: { tag: 'fall' },
        },
      },
    });
  });
});

describe('FcmPushAdapter', () => {
  it('sends with a cached oauth token and returns providerRef', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const account = {
      project_id: 'demo',
      client_email: 'demo@demo.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    };
    const calls: Array<{ url: string; body?: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, body: init?.body?.toString() });
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(
          JSON.stringify({ access_token: 'ya29.token', expires_in: 3600 }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ name: 'projects/demo/messages/1' }), {
        status: 200,
      });
    };
    const adapter = new FcmPushAdapter(
      {
        getOrThrow: () => JSON.stringify(account),
      } as unknown as ConfigService,
      fetchImpl,
    );
    const result = await adapter.send({
      token: 'device',
      notificationId: 'n1',
      type: 'sync',
      priority: 'normal',
      ttlSeconds: 60,
      collapseKey: 'sync',
      data: { k: 'v' },
    });
    expect(result).toEqual({
      status: 'accepted',
      providerRef: 'projects/demo/messages/1',
    });
    expect(calls[0]?.url).toContain('oauth2.googleapis.com/token');
    expect(calls[1]?.url).toContain('/messages:send');
    expect(calls[1]?.body).toContain('"priority":"NORMAL"');
  });

  it('maps network failures to retryable', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const account = {
      project_id: 'demo',
      client_email: 'demo@demo.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    };
    const fetchImpl: typeof fetch = async () => {
      throw new Error('ECONNRESET');
    };
    const adapter = new FcmPushAdapter(
      {
        getOrThrow: () => JSON.stringify(account),
      } as unknown as ConfigService,
      fetchImpl,
    );
    const result = await adapter.send({
      token: 'device',
      notificationId: 'n1',
      type: 'sync',
      priority: 'normal',
      ttlSeconds: 60,
      collapseKey: 'sync',
      data: {},
    });
    expect(result.status).toBe('retryable');
  });
});

describe('assertPushAllowed', () => {
  it('refuses the fake provider in production', () => {
    expect(() => assertPushAllowed('production', 'fake')).toThrow(/fake/);
    expect(() => assertPushAllowed('test', 'fake')).not.toThrow();
  });
});
