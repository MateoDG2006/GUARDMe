import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import type { IncomingHttpHeaders } from 'http';

export const AUTH = Symbol('AUTH');

// Tipado laxo: better-auth es ESM y se carga con import() en runtime.
export type AuthInstance = {
  api: {
    getSession: (args: { headers: Headers }) => Promise<{
      user: { id: string; isAnonymous?: boolean | null };
      session: { id: string };
    } | null>;
    signUpEmail: (args: unknown) => Promise<unknown>;
    signInAnonymous: (args?: unknown) => Promise<unknown>;
    signOut: (args: unknown) => Promise<unknown>;
    revokeSession: (args: {
      headers: Headers;
      body: { token: string };
    }) => Promise<unknown>;
    revokeSessions: (args: { headers: Headers }) => Promise<unknown>;
  };
  $disconnect: () => Promise<void>;
  handler?: unknown;
};

/** Equivalente a better-auth/node fromNodeHeaders, sin import ESM en Jest. */
export function fromNodeHeaders(headers: IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) result.append(key, item);
    } else {
      result.set(key, value);
    }
  }
  return result;
}

type BetterAuthBundle = {
  betterAuth: (opts: unknown) => AuthInstance;
  prismaAdapter: (
    client: PrismaClient,
    opts: { provider: string },
  ) => unknown;
  anonymous: (opts?: unknown) => unknown;
  bearer: () => unknown;
  toNodeHandler: (auth: AuthInstance) => unknown;
};

/**
 * En tests, test/helpers/preload-better-auth.mjs deja el bundle en globalThis
 * (Node carga ESM antes de Jest). En runtime normal usamos import() vía Function
 * para que ts-jest/CJS no lo reescriba a require().
 */
async function loadBetterAuth(): Promise<BetterAuthBundle> {
  const preloaded = (globalThis as { __guardmeBetterAuth?: BetterAuthBundle })
    .__guardmeBetterAuth;
  if (preloaded) return preloaded;
  const importEsm = (specifier: string) =>
    new Function('s', 'return import(s)')(specifier) as Promise<unknown>;
  const [core, adapter, plugins, node] = await Promise.all([
    importEsm('better-auth'),
    importEsm('better-auth/adapters/prisma'),
    importEsm('better-auth/plugins'),
    importEsm('better-auth/node'),
  ]);
  return {
    betterAuth: (core as { betterAuth: BetterAuthBundle['betterAuth'] })
      .betterAuth,
    prismaAdapter: (
      adapter as { prismaAdapter: BetterAuthBundle['prismaAdapter'] }
    ).prismaAdapter,
    anonymous: (plugins as { anonymous: BetterAuthBundle['anonymous'] })
      .anonymous,
    bearer: (plugins as { bearer: BetterAuthBundle['bearer'] }).bearer,
    toNodeHandler: (
      node as { toNodeHandler: BetterAuthBundle['toNodeHandler'] }
    ).toNodeHandler,
  };
}

export async function createAuth(config: ConfigService): Promise<AuthInstance> {
  const { betterAuth, prismaAdapter, anonymous, bearer } =
    await loadBetterAuth();

  const prisma = new PrismaClient({
    datasourceUrl: config.getOrThrow<string>('DATABASE_URL_AUTH'),
  });
  const baseURL = config.getOrThrow<string>('BETTER_AUTH_URL');
  const auth = betterAuth({
    secret: config.getOrThrow<string>('BETTER_AUTH_SECRET'),
    baseURL,
    basePath: '/v1/auth',
    // Android OkHttp suele omitir Origin; LAN / Tailscale / emulador para pruebas.
    trustedOrigins: [
      baseURL,
      'http://10.0.2.2:3000',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://100.*.*.*:3000',
      'http://192.168.*.*:3000',
      'http://10.*.*.*:3000',
    ],
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    account: { modelName: 'authAccount' },
    advanced: { database: { generateId: () => randomUUID() } },
    // Supervisados anónimos no pueden re-autenticarse; 7d dejaba huérfano el teléfono.
    session: { expiresIn: 60 * 60 * 24 * 90 },
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    plugins: [
      bearer(),
      anonymous({ disableDeleteAnonymousUser: true }),
    ],
  });
  return Object.assign(auth, {
    $disconnect: () => prisma.$disconnect(),
  }) as AuthInstance;
}

export async function mountAuth(app: INestApplication): Promise<void> {
  const { toNodeHandler } = await loadBetterAuth();
  const auth = app.get<AuthInstance>(AUTH);
  app.getHttpAdapter().getInstance().all('/v1/auth/*splat', toNodeHandler(auth));
}
