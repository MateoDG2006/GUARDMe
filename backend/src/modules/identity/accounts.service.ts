import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { DbService } from '../../infra/db/db.service';
import { AuditService } from '../audit/audit.service';
import { CapabilitiesService, type Capabilities } from './capabilities.service';
import type { BootstrapAccountDto } from './dto/bootstrap-account.dto';
import { toAccountContext, type Principal } from './principal';

export interface AccountView {
  id: string;
  displayName: string;
  onboardingKind: string;
  status: string;
  version: number;
}

export interface MeView {
  account: AccountView;
  installation: {
    id: string;
    status: string;
    appVersion: string;
    hasPushToken: boolean;
  } | null;
  accesses: Array<{
    accessId: string;
    profileId: string;
    profileName: string;
    relation: 'user' | 'caregiver';
    caregiverCategory: 'family' | 'medical' | null;
  }>;
  capabilities: Capabilities;
}

interface AccountRow {
  id: string;
  display_name: string;
  onboarding_kind: string;
  status: string;
  version: number;
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly capabilities: CapabilitiesService,
  ) {}

  async bootstrap(
    principal: Principal,
    input: BootstrapAccountDto,
  ): Promise<{ account: AccountView; created: boolean }> {
    if (principal.isAnonymous) {
      throw new DomainError('FORBIDDEN_ACTION');
    }
    return this.db.asOnboarding(toAccountContext(principal), async (tx) => {
      const inserted = await tx.$executeRaw`
        INSERT INTO guardme.accounts (auth_user_id, display_name, onboarding_kind)
        VALUES (
          ${principal.authUserId}::uuid,
          ${input.displayName ?? ''},
          ${input.onboardingKind}
        )
        ON CONFLICT (auth_user_id) DO NOTHING
      `;
      const rows = await tx.$queryRaw<AccountRow[]>`
        SELECT id, display_name, onboarding_kind, status, version
        FROM guardme.accounts
        WHERE auth_user_id = ${principal.authUserId}::uuid
      `;
      const account = rows[0];
      if (!account) throw new DomainError('NOT_FOUND');
      await this.audit.record(tx, {
        operation: 'account.bootstrap',
        result: 'ok',
        actorKind: 'account',
        actorAccountId: account.id,
        details: {
          onboardingKind: input.onboardingKind,
          created: inserted > 0,
        },
      });
      return { account: toAccountView(account), created: inserted > 0 };
    });
  }

  async getMe(principal: Principal): Promise<MeView> {
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const accounts = await tx.$queryRaw<AccountRow[]>`
        SELECT id, display_name, onboarding_kind, status, version
        FROM guardme.accounts
        WHERE id = ${principal.accountId}::uuid
      `;
      const account = accounts[0];
      if (!account) throw new DomainError('NOT_FOUND');
      let installation: MeView['installation'] = null;
      if (principal.installationId) {
        const rows = await tx.$queryRaw<
          Array<{
            id: string;
            status: string;
            app_version: string;
            has_push_token: boolean;
          }>
        >`
          SELECT id, status, app_version, (push_token IS NOT NULL) AS has_push_token
          FROM guardme.installations
          WHERE id = ${principal.installationId}::uuid
        `;
        const row = rows[0];
        if (row) {
          installation = {
            id: row.id,
            status: row.status,
            appVersion: row.app_version,
            hasPushToken: row.has_push_token,
          };
        }
      }
      const accessRows = await tx.$queryRaw<
        Array<{
          access_id: string;
          profile_id: string;
          profile_name: string;
          relation: 'user' | 'caregiver';
          caregiver_category: 'family' | 'medical' | null;
        }>
      >`
        SELECT
          pa.id AS access_id,
          pa.profile_id,
          p.display_name AS profile_name,
          pa.relation,
          pa.caregiver_category
        FROM guardme.profile_access pa
        JOIN guardme.profiles p ON p.id = pa.profile_id
        WHERE pa.account_id = ${principal.accountId}::uuid
          AND pa.status = 'active'
        ORDER BY p.display_name
      `;
      return {
        account: toAccountView(account),
        installation,
        accesses: accessRows.map((row) => ({
          accessId: row.access_id,
          profileId: row.profile_id,
          profileName: row.profile_name,
          relation: row.relation,
          caregiverCategory: row.caregiver_category,
        })),
        capabilities: this.capabilities.get(),
      };
    });
  }
}

function toAccountView(row: AccountRow): AccountView {
  return {
    id: row.id,
    displayName: row.display_name,
    onboardingKind: row.onboarding_kind,
    status: row.status,
    version: row.version,
  };
}
