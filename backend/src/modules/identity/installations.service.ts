import { forwardRef, Inject, Injectable } from '@nestjs/common';
import type { IncomingHttpHeaders } from 'http';
import { DomainError } from '../../common/errors/domain-error';
import { ClockPort } from '../../infra/clock/clock.port';
import { DbService, type Tx } from '../../infra/db/db.service';
import { AuditService } from '../audit/audit.service';
import { GatewaysService } from '../devices/gateways.service';
import { AUTH, fromNodeHeaders, type AuthInstance } from './better-auth';
import type { RegisterInstallationDto } from './dto/register-installation.dto';
import { toAccountContext, type Principal } from './principal';

export interface InstallationView {
  id: string;
  status: string;
  appVersion: string;
  hasPushToken: boolean;
}

@Injectable()
export class InstallationsService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly clock: ClockPort,
    @Inject(AUTH) private readonly auth: AuthInstance,
    @Inject(forwardRef(() => GatewaysService))
    private readonly gateways: GatewaysService,
  ) {}

  async register(
    principal: Principal,
    input: RegisterInstallationDto,
  ): Promise<InstallationView> {
    if (!principal.accountId) throw new DomainError('ACCOUNT_NOT_BOOTSTRAPPED');
    return this.db.asOnboarding(toAccountContext(principal), (tx) =>
      this.registerInTx(tx, principal, input),
    );
  }

  async registerInTx(
    tx: Tx,
    principal: Principal,
    input: RegisterInstallationDto,
  ): Promise<InstallationView> {
    if (!principal.accountId) throw new DomainError('ACCOUNT_NOT_BOOTSTRAPPED');
    const now = this.clock.now();
    {
      if (input.pushToken) {
        const replaced = await tx.$queryRaw<Array<{ id: string }>>`
          UPDATE guardme.installations
          SET status = 'revoked',
              revoked_at = ${now},
              revoke_reason = 'replaced'
          WHERE push_token = ${input.pushToken}
            AND status = 'active'
            AND NOT (
              account_id = ${principal.accountId}::uuid
              AND client_installation_id = ${input.clientInstallationId}::uuid
            )
          RETURNING id
        `;
        await this.gateways.closeForInstallations(
          tx,
          replaced.map((row) => row.id),
          'installation_revoked',
        );
      }

      const existing = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM guardme.installations
        WHERE account_id = ${principal.accountId}::uuid
          AND client_installation_id = ${input.clientInstallationId}::uuid
          AND status = 'active'
      `;
      let id = existing[0]?.id;
      if (id) {
        await tx.$executeRaw`
          UPDATE guardme.installations
          SET auth_session_id = ${principal.sessionId}::uuid,
              app_version = ${input.appVersion},
              last_seen_at = ${now},
              push_token = CASE
                WHEN ${input.pushToken ?? null}::text IS NULL THEN push_token
                ELSE ${input.pushToken ?? null}
              END,
              push_token_updated_at = CASE
                WHEN ${input.pushToken ?? null}::text IS NULL THEN push_token_updated_at
                ELSE ${now}
              END
          WHERE id = ${id}::uuid
        `;
      } else {
        const inserted = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO guardme.installations (
            account_id,
            client_installation_id,
            auth_session_id,
            platform,
            app_version,
            push_token,
            push_token_updated_at,
            last_seen_at
          )
          VALUES (
            ${principal.accountId}::uuid,
            ${input.clientInstallationId}::uuid,
            ${principal.sessionId}::uuid,
            ${input.platform},
            ${input.appVersion},
            ${input.pushToken ?? null},
            ${input.pushToken ? now : null},
            ${now}
          )
          RETURNING id
        `;
        id = inserted[0]?.id;
      }
      if (!id) throw new DomainError('NOT_FOUND');
      await this.audit.record(tx, {
        operation: 'installation.register',
        result: 'ok',
        actorKind: 'installation',
        actorAccountId: principal.accountId,
        details: { installationId: id, platform: input.platform },
      });
      const view = await tx.$queryRaw<
        Array<{
          id: string;
          status: string;
          app_version: string;
          has_push_token: boolean;
        }>
      >`
        SELECT id, status, app_version, (push_token IS NOT NULL) AS has_push_token
        FROM guardme.installations
        WHERE id = ${id}::uuid
      `;
      const row = view[0];
      if (!row) throw new DomainError('NOT_FOUND');
      return {
        id: row.id,
        status: row.status,
        appVersion: row.app_version,
        hasPushToken: row.has_push_token,
      };
    }
  }

  async revoke(
    principal: Principal,
    installationId: string,
    reason: 'user_revoked',
  ): Promise<void> {
    await this.revokeOwned(principal, installationId, reason);
  }

  async logout(
    principal: Principal,
    scope: 'installation' | 'all',
    headers: IncomingHttpHeaders,
  ): Promise<{ revokedInstallations: number }> {
    const authHeaders = fromNodeHeaders(headers);
    if (scope === 'installation') {
      if (!principal.installationId) {
        throw new DomainError('INSTALLATION_MISMATCH');
      }
      const revoked = await this.revokeOwned(
        principal,
        principal.installationId,
        'logout',
      );
      const token = bearerToken(headers);
      if (!token) throw new DomainError('UNAUTHENTICATED');
      await this.auth.api.revokeSession({
        headers: authHeaders,
        body: { token },
      });
      return { revokedInstallations: revoked };
    }
    const now = this.clock.now();
    const revoked = await this.db.asAccount(
      toAccountContext(principal),
      async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE guardme.installations
        SET status = 'revoked',
            revoked_at = ${now},
            revoke_reason = 'logout_all',
            last_seen_at = ${now}
        WHERE account_id = ${principal.accountId}::uuid
          AND status = 'active'
        RETURNING id
      `;
        await this.gateways.closeForInstallations(
          tx,
          rows.map((row) => row.id),
          'installation_revoked',
        );
        return rows.length;
      },
    );
    await this.auth.api.revokeSessions({ headers: authHeaders });
    return { revokedInstallations: revoked };
  }

  private async revokeOwned(
    principal: Principal,
    installationId: string,
    reason: 'user_revoked' | 'logout',
  ): Promise<number> {
    const now = this.clock.now();
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT status
        FROM guardme.installations
        WHERE id = ${installationId}::uuid
      `;
      if (!rows[0]) throw new DomainError('NOT_FOUND');
      if (rows[0].status === 'revoked') return 0;
      const updated = await tx.$executeRaw`
        UPDATE guardme.installations
        SET status = 'revoked',
            revoked_at = ${now},
            revoke_reason = ${reason},
            last_seen_at = ${now}
        WHERE id = ${installationId}::uuid
          AND status = 'active'
      `;
      if (updated > 0) {
        await this.gateways.closeForInstallations(
          tx,
          [installationId],
          'installation_revoked',
        );
      }
      return updated;
    });
  }
}

function bearerToken(headers: IncomingHttpHeaders): string | null {
  const raw = headers.authorization ?? headers.Authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !value.startsWith('Bearer ')) return null;
  const token = value.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}
