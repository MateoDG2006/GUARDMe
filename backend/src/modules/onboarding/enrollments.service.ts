import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import {
  hashSecret,
  newEnrollmentCode,
  normalizeEnrollmentCode,
} from '../../common/secrets/secret-codes';
import { PolicyConfig } from '../../config/policy.config';
import { ClockPort } from '../../infra/clock/clock.port';
import { DbService, type Tx } from '../../infra/db/db.service';
import { AuditService } from '../audit/audit.service';
import type { AccountView } from '../identity/accounts.service';
import { GatewaysService } from '../devices/gateways.service';
import {
  InstallationsService,
  type InstallationView,
} from '../identity/installations.service';
import { toAccountContext, type Principal } from '../identity/principal';
import {
  AccessService,
  toAccess,
  type ProfileAccessView,
} from '../profiles/access.service';
import type {
  ConsumeEnrollmentDto,
  IssueEnrollmentDto,
} from './dto/enrollment.dto';

export interface ConsumeEnrollmentResult {
  account: AccountView;
  access: ProfileAccessView;
  installation: InstallationView;
  replay: boolean;
}

interface EnrollmentRow {
  id: string;
  profile_id: string;
  purpose: 'initial' | 'replace_user';
  status: string;
  expires_at: Date;
  issued_by_account_id: string;
  consumed_by_account_id: string | null;
  consumed_by_installation_id: string | null;
}

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly db: DbService,
    private readonly access: AccessService,
    private readonly installations: InstallationsService,
    private readonly gateways: GatewaysService,
    private readonly audit: AuditService,
    private readonly clock: ClockPort,
    private readonly policy: PolicyConfig,
  ) {}

  issue(
    principal: Principal,
    profileId: string,
    input: IssueEnrollmentDto,
  ): Promise<{ enrollmentId: string; code: string; expiresAt: string }> {
    const now = this.clock.now();
    const expires = new Date(
      now.getTime() + this.policy.enrollmentCodeTtlMin * 60_000,
    );
    const code = newEnrollmentCode();
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const mine = await this.access.requireAccess(tx, profileId);
      if (mine.relation !== 'caregiver')
        throw new DomainError('FORBIDDEN_ACTION');
      await tx.$executeRaw`
        UPDATE guardme.supervised_enrollments
        SET status = 'withdrawn'
        WHERE profile_id = ${profileId}::uuid
          AND status = 'pending'
      `;
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO guardme.supervised_enrollments (
          profile_id, issued_by_account_id, purpose, code_hash, expires_at
        )
        VALUES (
          ${profileId}::uuid,
          ${principal.accountId}::uuid,
          ${input.purpose},
          ${hashSecret(normalizeEnrollmentCode(code))},
          ${expires}
        )
        RETURNING id
      `;
      const id = rows[0]?.id;
      if (!id) throw new DomainError('NOT_FOUND');
      return { enrollmentId: id, code, expiresAt: expires.toISOString() };
    });
  }

  withdraw(principal: Principal, enrollmentId: string): Promise<void> {
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const updated = await tx.$executeRaw`
        UPDATE guardme.supervised_enrollments
        SET status = 'withdrawn'
        WHERE id = ${enrollmentId}::uuid
          AND status = 'pending'
      `;
      if (updated > 0) return;
      const rows = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT status FROM guardme.supervised_enrollments WHERE id = ${enrollmentId}::uuid
      `;
      if (!rows[0]) throw new DomainError('NOT_FOUND');
      throw new DomainError('INCOMPATIBLE_STATE', undefined, {
        status: rows[0].status,
      });
    });
  }

  consume(
    principal: Principal,
    input: ConsumeEnrollmentDto,
  ): Promise<ConsumeEnrollmentResult> {
    const now = this.clock.now();
    const codeHash = hashSecret(normalizeEnrollmentCode(input.code));
    return this.db.asOnboarding(toAccountContext(principal), async (tx) => {
      if (principal.accountId) {
        const replay = await this.replay(tx, codeHash, principal.accountId);
        if (replay) return replay;
      }
      const rows = await tx.$queryRaw<EnrollmentRow[]>`
        SELECT
          id, profile_id, purpose, status, expires_at, issued_by_account_id,
          consumed_by_account_id, consumed_by_installation_id
        FROM guardme.supervised_enrollments
        WHERE code_hash = ${codeHash}
        FOR UPDATE
      `;
      const enrollment = rows[0];
      if (!enrollment) throw new DomainError('NOT_FOUND');
      if (enrollment.status !== 'pending' || enrollment.expires_at <= now) {
        if (enrollment.status === 'pending') {
          await tx.$executeRaw`
            UPDATE guardme.supervised_enrollments
            SET status = 'expired'
            WHERE id = ${enrollment.id}::uuid
          `;
        }
        throw new DomainError('NOT_FOUND');
      }

      const account = await this.resolveAccount(tx, principal);
      const caregiver = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM guardme.profile_access
        WHERE account_id = ${account.id}::uuid
          AND profile_id = ${enrollment.profile_id}::uuid
          AND relation = 'caregiver'
          AND status = 'active'
      `;
      if (caregiver[0]) {
        throw new DomainError('INCOMPATIBLE_STATE', undefined, {
          reason: 'already_caregiver',
        });
      }
      const currentUser = await tx.$queryRaw<
        Array<{ id: string; account_id: string }>
      >`
        SELECT id, account_id
        FROM guardme.profile_access
        WHERE profile_id = ${enrollment.profile_id}::uuid
          AND relation = 'user'
          AND status = 'active'
      `;
      const linked = currentUser[0];
      if (linked && linked.account_id !== account.id) {
        if (enrollment.purpose !== 'replace_user') {
          throw new DomainError('INCOMPATIBLE_STATE', undefined, {
            reason: 'user_already_linked',
          });
        }
        await tx.$executeRaw`
          UPDATE guardme.profile_access
          SET status = 'revoked',
              revoked_at = ${now},
              revoked_by_account_id = ${enrollment.issued_by_account_id}::uuid
          WHERE id = ${linked.id}::uuid
        `;
        const revokedInstallations = await tx.$queryRaw<Array<{ id: string }>>`
          UPDATE guardme.installations
          SET status = 'revoked',
              revoked_at = ${now},
              revoke_reason = 'replaced'
          WHERE account_id = ${linked.account_id}::uuid
            AND status = 'active'
          RETURNING id
        `;
        await this.gateways.closeForInstallations(
          tx,
          revokedInstallations.map((row) => row.id),
          'installation_revoked',
        );
      }

      let accessId = linked?.account_id === account.id ? linked.id : undefined;
      if (!accessId) {
        const inserted = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO guardme.profile_access (
            account_id, profile_id, relation, granted_via
          )
          VALUES (
            ${account.id}::uuid,
            ${enrollment.profile_id}::uuid,
            'user',
            'enrollment'
          )
          RETURNING id
        `;
        accessId = inserted[0]?.id;
      }
      if (!accessId) throw new DomainError('NOT_FOUND');

      const bound: Principal = { ...principal, accountId: account.id };
      const installation = await this.installations.registerInTx(tx, bound, {
        clientInstallationId: input.clientInstallationId,
        platform: 'android',
        appVersion: input.appVersion,
        pushToken: input.pushToken,
      });
      await tx.$executeRaw`
        UPDATE guardme.supervised_enrollments
        SET status = 'consumed',
            consumed_by_account_id = ${account.id}::uuid,
            consumed_by_installation_id = ${installation.id}::uuid,
            consumed_at = ${now}
        WHERE id = ${enrollment.id}::uuid
      `;
      await this.audit.record(tx, {
        operation: 'enrollment.consume',
        result: 'ok',
        actorKind: 'account',
        actorAccountId: account.id,
        profileId: enrollment.profile_id,
        details: { purpose: enrollment.purpose },
      });
      return {
        account,
        access: {
          accessId,
          profileId: enrollment.profile_id,
          relation: 'user',
          caregiverCategory: null,
        },
        installation,
        replay: false,
      };
    });
  }

  private async replay(
    tx: Tx,
    codeHash: string,
    accountId: string,
  ): Promise<ConsumeEnrollmentResult | undefined> {
    const rows = await tx.$queryRaw<EnrollmentRow[]>`
      SELECT
        id, profile_id, purpose, status, expires_at, issued_by_account_id,
        consumed_by_account_id, consumed_by_installation_id
      FROM guardme.supervised_enrollments
      WHERE code_hash = ${codeHash}
        AND status = 'consumed'
        AND consumed_by_account_id = ${accountId}::uuid
    `;
    const enrollment = rows[0];
    if (!enrollment?.consumed_by_installation_id) return undefined;
    const account = await this.readAccount(tx, accountId);
    const accessRows = await tx.$queryRaw<
      Array<{
        id: string;
        profile_id: string;
        relation: 'user' | 'caregiver';
        caregiver_category: 'family' | 'medical' | null;
      }>
    >`
      SELECT id, profile_id, relation, caregiver_category
      FROM guardme.profile_access
      WHERE account_id = ${accountId}::uuid
        AND profile_id = ${enrollment.profile_id}::uuid
        AND granted_via = 'enrollment'
      ORDER BY granted_at DESC
      LIMIT 1
    `;
    const access = accessRows[0];
    const installations = await tx.$queryRaw<
      Array<{
        id: string;
        status: string;
        app_version: string;
        has_push_token: boolean;
      }>
    >`
      SELECT id, status, app_version, (push_token IS NOT NULL) AS has_push_token
      FROM guardme.installations
      WHERE id = ${enrollment.consumed_by_installation_id}::uuid
    `;
    const installation = installations[0];
    if (!access || !installation) return undefined;
    return {
      account,
      access: toAccess(access),
      installation: {
        id: installation.id,
        status: installation.status,
        appVersion: installation.app_version,
        hasPushToken: installation.has_push_token,
      },
      replay: true,
    };
  }

  private async resolveAccount(
    tx: Tx,
    principal: Principal,
  ): Promise<AccountView> {
    if (principal.accountId) return this.readAccount(tx, principal.accountId);
    await tx.$executeRaw`
      INSERT INTO guardme.accounts (auth_user_id, display_name, onboarding_kind)
      VALUES (${principal.authUserId}::uuid, '', 'supervised')
      ON CONFLICT (auth_user_id) DO NOTHING
    `;
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM guardme.accounts WHERE auth_user_id = ${principal.authUserId}::uuid
    `;
    const id = rows[0]?.id;
    if (!id) throw new DomainError('NOT_FOUND');
    return this.readAccount(tx, id);
  }

  private async readAccount(tx: Tx, accountId: string): Promise<AccountView> {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        display_name: string;
        onboarding_kind: string;
        status: string;
        version: number;
      }>
    >`
      SELECT id, display_name, onboarding_kind, status, version
      FROM guardme.accounts
      WHERE id = ${accountId}::uuid
    `;
    const row = rows[0];
    if (!row) throw new DomainError('NOT_FOUND');
    return {
      id: row.id,
      displayName: row.display_name,
      onboardingKind: row.onboarding_kind,
      status: row.status,
      version: row.version,
    };
  }
}
