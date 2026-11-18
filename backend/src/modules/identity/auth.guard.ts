import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import type { IncomingMessage } from 'http';
import { ALLOW_UNBOOTSTRAPPED } from '../../common/decorators/allow-unbootstrapped.decorator';
import { IS_PUBLIC } from '../../common/decorators/public.decorator';
import { REQUIRE_INSTALLATION } from '../../common/decorators/require-installation.decorator';
import { DomainError } from '../../common/errors/domain-error';
import { PRISMA_API } from '../../infra/db/db.service';
import { AUTH, fromNodeHeaders, type AuthInstance } from './better-auth';
import type { Principal } from './principal';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ResolvedPrincipal {
  account_id: string | null;
  account_status: string | null;
  installation_account_id: string | null;
  installation_status: string | null;
  installation_session_id: string | null;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AUTH) private readonly auth: AuthInstance,
    @Inject(PRISMA_API) private readonly api: PrismaClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.flag(context, IS_PUBLIC)) return true;

    const request = context.switchToHttp().getRequest<
      IncomingMessage & {
        header: (name: string) => string | undefined;
        principal?: Principal;
        headers: IncomingMessage['headers'];
      }
    >();

    const session = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) throw new DomainError('UNAUTHENTICATED');

    const verified = {
      sub: session.user.id,
      sessionId: session.session.id,
      isAnonymous: session.user.isAnonymous === true,
    };
    const installationId = installationHeader(
      request.header('x-installation-id'),
    );

    // shortcut: 2 consultas por petición (getSession + resolve_principal); activar cookieCache ≤30 s si la latencia lo pide.
    const rows = await this.api.$queryRaw<ResolvedPrincipal[]>`
      SELECT
        account_id,
        account_status,
        installation_account_id,
        installation_status,
        installation_session_id
      FROM guardme.resolve_principal(
        ${verified.sub}::uuid,
        ${installationId}::uuid
      )
    `;
    const resolved = rows[0];

    const accountId = resolved?.account_id ?? null;
    if (!accountId) {
      if (!this.flag(context, ALLOW_UNBOOTSTRAPPED)) {
        throw new DomainError('ACCOUNT_NOT_BOOTSTRAPPED');
      }
    } else if (resolved?.account_status !== 'active') {
      throw new DomainError('SESSION_REVOKED');
    }

    let acceptedInstallation: string | null = null;
    if (installationId) {
      if (resolved?.installation_account_id !== accountId) {
        throw new DomainError('INSTALLATION_MISMATCH');
      }
      if (resolved?.installation_status === 'revoked') {
        throw new DomainError('SESSION_REVOKED');
      }
      if (resolved?.installation_session_id !== verified.sessionId) {
        throw new DomainError('INSTALLATION_MISMATCH');
      }
      acceptedInstallation = installationId;
    }
    if (this.flag(context, REQUIRE_INSTALLATION) && !acceptedInstallation) {
      throw new DomainError('INSTALLATION_MISMATCH');
    }

    request.principal = {
      authUserId: verified.sub,
      sessionId: verified.sessionId,
      isAnonymous: verified.isAnonymous,
      accountId,
      installationId: acceptedInstallation,
    };
    return true;
  }

  private flag(context: ExecutionContext, key: string): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(key, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }
}

function installationHeader(header: string | undefined): string | null {
  if (header === undefined || header === '') return null;
  if (!UUID_RE.test(header)) {
    throw new DomainError('VALIDATION_FAILED', 'Validación fallida', {
      fields: [{ field: 'X-Installation-Id', messages: ['UUID inválido'] }],
    });
  }
  return header;
}
