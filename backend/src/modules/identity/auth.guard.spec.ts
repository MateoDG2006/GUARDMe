import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainError } from '../../common/errors/domain-error';
import { AuthGuard } from './auth.guard';
import type { AuthInstance } from './better-auth';

const VERIFIED = {
  sub: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  isAnonymous: false,
};

const ACCOUNT = '33333333-3333-4333-8333-333333333333';
const INSTALLATION = '44444444-4444-4444-8444-444444444444';

function context(
  flags: Record<string, boolean>,
  request: Record<string, unknown>,
) {
  const reflector = {
    getAllAndOverride: (key: string) => flags[key] === true,
  } as unknown as Reflector;
  const http = {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({ getRequest: () => request }),
  };
  return { reflector, ctx: http as unknown as ExecutionContext, request };
}

function authWithSession(
  session: {
    user: { id: string; isAnonymous?: boolean };
    session: { id: string };
  } | null,
): AuthInstance {
  return {
    api: {
      getSession: jest.fn().mockResolvedValue(session),
    },
  } as unknown as AuthInstance;
}

describe('AuthGuard', () => {
  it('does not call resolve_principal when the session is missing', async () => {
    const { reflector, ctx } = context(
      {},
      {
        header: () => 'Bearer bad-token',
        headers: { authorization: 'Bearer bad-token' },
      },
    );
    const auth = authWithSession(null);
    const api = { $queryRaw: jest.fn() };
    const guard = new AuthGuard(reflector, auth, api as never);

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(api.$queryRaw).not.toHaveBeenCalled();
  });

  it('attaches the principal when the session and installation match', async () => {
    const request: {
      header: (name: string) => string | undefined;
      headers: Record<string, string>;
      principal?: unknown;
    } = {
      headers: {
        authorization: 'Bearer good',
        'x-installation-id': INSTALLATION,
      },
      header: (name) =>
        name === 'authorization'
          ? 'Bearer good'
          : name === 'x-installation-id'
            ? INSTALLATION
            : undefined,
    };
    const { reflector, ctx } = context({}, request);
    const auth = authWithSession({
      user: { id: VERIFIED.sub, isAnonymous: false },
      session: { id: VERIFIED.sessionId },
    });
    const api = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          account_id: ACCOUNT,
          account_status: 'active',
          installation_account_id: ACCOUNT,
          installation_status: 'active',
          installation_session_id: VERIFIED.sessionId,
        },
      ]),
    };
    const guard = new AuthGuard(reflector, auth, api as never);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.principal).toEqual({
      authUserId: VERIFIED.sub,
      sessionId: VERIFIED.sessionId,
      isAnonymous: false,
      accountId: ACCOUNT,
      installationId: INSTALLATION,
    });
  });

  it('rejects an invalid installation uuid without querying', async () => {
    const { reflector, ctx } = context(
      {},
      {
        headers: { authorization: 'Bearer good' },
        header: (name: string) =>
          name === 'authorization'
            ? 'Bearer good'
            : name === 'x-installation-id'
              ? 'not-a-uuid'
              : undefined,
      },
    );
    const auth = authWithSession({
      user: { id: VERIFIED.sub },
      session: { id: VERIFIED.sessionId },
    });
    const api = { $queryRaw: jest.fn() };
    const guard = new AuthGuard(reflector, auth, api as never);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(DomainError);
    expect(api.$queryRaw).not.toHaveBeenCalled();
  });
});
