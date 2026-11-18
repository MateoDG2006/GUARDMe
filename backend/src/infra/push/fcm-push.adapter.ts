import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, importPKCS8 } from 'jose';
import { PushPort, type PushMessage, type PushResult } from './push.port';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

interface CachedToken {
  value: string;
  expiresAtMs: number;
}

// INVALID_ARGUMENT también sale por mensaje mal armado; no borrar tokens.
const TOKEN_INVALID = new Set(['UNREGISTERED']);
const RETRYABLE = new Set(['UNAVAILABLE', 'INTERNAL', 'QUOTA_EXCEEDED']);

export function mapFcmHttpError(
  status: number,
  errorCode: string | undefined,
): PushResult {
  if (errorCode && TOKEN_INVALID.has(errorCode)) {
    return { status: 'token_invalid' };
  }
  if (
    (errorCode && RETRYABLE.has(errorCode)) ||
    status === 429 ||
    status >= 500
  ) {
    return { status: 'retryable', error: errorCode ?? `http_${status}` };
  }
  return {
    status: 'failed',
    error: errorCode ?? `http_${status}`,
  };
}

export function buildFcmMessageBody(message: PushMessage) {
  const visible =
    message.title != null && message.body != null
      ? { title: message.title, body: message.body }
      : undefined;
  return {
    message: {
      token: message.token,
      data: message.data,
      notification: visible,
      android: {
        priority: message.priority === 'high' ? 'HIGH' : 'NORMAL',
        ttl: `${message.ttlSeconds}s`,
        collapse_key: message.collapseKey,
        notification: visible ? { tag: message.collapseKey } : undefined,
      },
    },
  };
}

@Injectable()
export class FcmPushAdapter extends PushPort {
  private readonly account: ServiceAccount;
  private readonly privateKeyPromise: Promise<CryptoKey>;
  private cached: CachedToken | null = null;
  private readonly fetchImpl: typeof fetch;

  constructor(config: ConfigService, fetchImpl: typeof fetch = fetch) {
    super();
    this.fetchImpl = fetchImpl;
    const json = config.getOrThrow<string>('FCM_SERVICE_ACCOUNT_JSON');
    const parsed = JSON.parse(json) as Partial<ServiceAccount>;
    if (
      typeof parsed.project_id !== 'string' ||
      typeof parsed.client_email !== 'string' ||
      typeof parsed.private_key !== 'string'
    ) {
      throw new Error(
        'FCM_SERVICE_ACCOUNT_JSON requiere project_id, client_email y private_key',
      );
    }
    this.account = {
      project_id: parsed.project_id,
      client_email: parsed.client_email,
      private_key: parsed.private_key,
    };
    this.privateKeyPromise = importPKCS8(this.account.private_key, 'RS256');
  }

  async send(message: PushMessage): Promise<PushResult> {
    try {
      const accessToken = await this.accessToken();
      const response = await this.fetchImpl(
        `https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(buildFcmMessageBody(message)),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: {
            status?: string;
            details?: Array<{ errorCode?: string }>;
          };
        } | null;
        const errorCode =
          payload?.error?.details?.find((detail) => detail.errorCode)
            ?.errorCode ?? payload?.error?.status;
        return mapFcmHttpError(response.status, errorCode);
      }
      const body = (await response.json()) as { name?: string };
      if (!body.name) return { status: 'failed', error: 'missing_name' };
      return { status: 'accepted', providerRef: body.name };
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : 'network_error';
      return { status: 'retryable', error: messageText };
    }
  }

  private async accessToken(): Promise<string> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAtMs - 60_000 > now) {
      return this.cached.value;
    }
    const key = await this.privateKeyPromise;
    const assertion = await new SignJWT({
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(this.account.client_email)
      .setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);
    const response = await this.fetchImpl(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`oauth_token_http_${response.status}`);
    }
    const body = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!body.access_token) throw new Error('oauth_token_missing');
    this.cached = {
      value: body.access_token,
      expiresAtMs: now + (body.expires_in ?? 3600) * 1000,
    };
    return body.access_token;
  }
}
