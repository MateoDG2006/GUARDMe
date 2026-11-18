import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { ClockPort } from '../../infra/clock/clock.port';
import type { Tx } from '../../infra/db/db.service';
import { DbService } from '../../infra/db/db.service';
import { AuditService } from '../audit/audit.service';
import { SyncSignalService } from '../sync/sync-signal.service';
import { GatewaysService } from '../devices/gateways.service';
import { toAccountContext, type Principal } from '../identity/principal';

export type Relation = 'user' | 'caregiver';

export interface ProfileAccessView {
  accessId: string;
  profileId: string;
  relation: Relation;
  caregiverCategory: 'family' | 'medical' | null;
}

export interface MemberView {
  accessId: string;
  accountId: string;
  displayName: string;
  relation: Relation;
  caregiverCategory: 'family' | 'medical' | null;
  grantedAt: string;
}

interface AccessRow {
  id: string;
  profile_id: string;
  relation: Relation;
  caregiver_category: 'family' | 'medical' | null;
}

@Injectable()
export class AccessService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly clock: ClockPort,
    private readonly sync: SyncSignalService,
    @Inject(forwardRef(() => GatewaysService))
    private readonly gateways: GatewaysService,
  ) {}

  async requireAccess(tx: Tx, profileId: string): Promise<ProfileAccessView> {
    const rows = await tx.$queryRaw<AccessRow[]>`
      SELECT id, profile_id, relation, caregiver_category
      FROM guardme.profile_access
      WHERE profile_id = ${profileId}::uuid
        AND status = 'active'
        AND account_id = guardme.ctx_account_id()
    `;
    const row = rows[0];
    if (!row) throw new DomainError('NOT_FOUND');
    return toAccess(row);
  }

  async listActiveAccounts(
    tx: Tx,
    profileId: string,
    relation?: Relation,
  ): Promise<Array<{ accountId: string; relation: Relation }>> {
    const rows = await tx.$queryRaw<
      Array<{ account_id: string; relation: Relation }>
    >`
      SELECT account_id, relation
      FROM guardme.profile_access
      WHERE profile_id = ${profileId}::uuid
        AND status = 'active'
        AND (${relation ?? null}::text IS NULL OR relation = ${relation ?? null})
    `;
    return rows.map((row) => ({
      accountId: row.account_id,
      relation: row.relation,
    }));
  }

  listMembers(principal: Principal, profileId: string): Promise<MemberView[]> {
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      await this.requireAccess(tx, profileId);
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          account_id: string;
          display_name: string;
          relation: Relation;
          caregiver_category: 'family' | 'medical' | null;
          granted_at: Date;
        }>
      >`
        SELECT pa.id, pa.account_id, a.display_name, pa.relation, pa.caregiver_category, pa.granted_at
        FROM guardme.profile_access pa
        JOIN guardme.accounts a ON a.id = pa.account_id
        WHERE pa.profile_id = ${profileId}::uuid
          AND pa.status = 'active'
        ORDER BY pa.granted_at
      `;
      return rows.map((row) => ({
        accessId: row.id,
        accountId: row.account_id,
        displayName: row.display_name,
        relation: row.relation,
        caregiverCategory: row.caregiver_category,
        grantedAt: row.granted_at.toISOString(),
      }));
    });
  }

  revokeAccess(
    principal: Principal,
    profileId: string,
    accessId: string,
    opts: { confirmLast: boolean },
  ): Promise<void> {
    const now = this.clock.now();
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      await this.requireAccess(tx, profileId);
      const target = await tx.$queryRaw<
        Array<{
          id: string;
          account_id: string;
          relation: Relation;
          status: string;
        }>
      >`
        SELECT id, account_id, relation, status
        FROM guardme.profile_access
        WHERE id = ${accessId}::uuid
          AND profile_id = ${profileId}::uuid
      `;
      const row = target[0];
      if (!row) throw new DomainError('NOT_FOUND');
      if (row.status === 'revoked') return;

      const active = await tx.$queryRaw<Array<{ n: number }>>`
        SELECT count(*)::int AS n
        FROM guardme.profile_access
        WHERE profile_id = ${profileId}::uuid
          AND status = 'active'
      `;
      if ((active[0]?.n ?? 0) <= 1 && !opts.confirmLast) {
        throw new DomainError('INCOMPATIBLE_STATE', undefined, {
          reason: 'last_access',
        });
      }
      if (row.relation === 'user') {
        const installations = await tx.$queryRaw<
          Array<{ installation_id: string }>
        >`
          SELECT g.installation_id
          FROM guardme.gateways g
          JOIN guardme.cane_assignments a ON a.id = g.cane_assignment_id
          JOIN guardme.installations i ON i.id = g.installation_id
          WHERE a.profile_id = ${profileId}::uuid
            AND g.ended_at IS NULL
            AND i.account_id = ${row.account_id}::uuid
        `;
        await this.gateways.closeForInstallations(
          tx,
          installations.map((item) => item.installation_id),
          'access_revoked',
        );
      }
      await tx.$executeRaw`
        UPDATE guardme.profile_access
        SET status = 'revoked',
            revoked_at = ${now},
            revoked_by_account_id = ${principal.accountId}::uuid
        WHERE id = ${accessId}::uuid
          AND status = 'active'
      `;
      await tx.$executeRaw`
        UPDATE guardme.location_read_grants AS g
        SET revoked_at = ${now}::timestamptz
        FROM guardme.location_consents AS c
        WHERE g.consent_id = c.id
          AND c.profile_id = ${profileId}::uuid
          AND g.account_id = ${row.account_id}::uuid
          AND g.revoked_at IS NULL
      `;
      await this.sync.requestSyncSignal(tx, profileId, 'changes');
      await this.audit.record(tx, {
        operation: 'access.revoke',
        result: 'ok',
        actorKind: 'account',
        actorAccountId: principal.accountId,
        profileId,
        details: { accessId, relation: row.relation },
      });
    });
  }
}

export function toAccess(row: AccessRow): ProfileAccessView {
  return {
    accessId: row.id,
    profileId: row.profile_id,
    relation: row.relation,
    caregiverCategory: row.caregiver_category,
  };
}
