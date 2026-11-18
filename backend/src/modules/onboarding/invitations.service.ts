import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { hashSecret } from '../../common/secrets/secret-codes';
import { newInvitationSecret } from '../../common/secrets/secret-codes';
import { PolicyConfig } from '../../config/policy.config';
import { ClockPort } from '../../infra/clock/clock.port';
import { DbService, type Tx } from '../../infra/db/db.service';
import { AuditService } from '../audit/audit.service';
import { SyncSignalService } from '../sync/sync-signal.service';
import { toAccountContext, type Principal } from '../identity/principal';
import {
  AccessService,
  toAccess,
  type ProfileAccessView,
} from '../profiles/access.service';
import type {
  AcceptInvitationDto,
  IssueInvitationDto,
} from './dto/invitation.dto';

export interface InvitationView {
  id: string;
  recipientHint: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
}

interface InvitationRow {
  id: string;
  profile_id: string;
  status: string;
  expires_at: Date;
  consumed_by_account_id: string | null;
  created_access_id: string | null;
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly db: DbService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly clock: ClockPort,
    private readonly policy: PolicyConfig,
    private readonly sync: SyncSignalService,
  ) {}

  issue(
    principal: Principal,
    profileId: string,
    input: IssueInvitationDto,
  ): Promise<{ invitationId: string; secret: string; expiresAt: string }> {
    const now = this.clock.now();
    const expires = new Date(
      now.getTime() + this.policy.invitationTtlHours * 3_600_000,
    );
    const secret = newInvitationSecret();
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      await this.access.requireAccess(tx, profileId);
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO guardme.invitations (
          profile_id, issued_by_account_id, secret_hash, recipient_hint, expires_at
        )
        VALUES (
          ${profileId}::uuid,
          ${principal.accountId}::uuid,
          ${hashSecret(secret)},
          ${input.recipientHint ?? null},
          ${expires}
        )
        RETURNING id
      `;
      const id = rows[0]?.id;
      if (!id) throw new DomainError('NOT_FOUND');
      await this.sync.requestSyncSignal(tx, profileId, 'changes');
      return { invitationId: id, secret, expiresAt: expires.toISOString() };
    });
  }

  listPending(
    principal: Principal,
    profileId: string,
  ): Promise<InvitationView[]> {
    const now = this.clock.now();
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      await this.access.requireAccess(tx, profileId);
      await tx.$executeRaw`
        UPDATE guardme.invitations
        SET status = 'expired'
        WHERE profile_id = ${profileId}::uuid
          AND status = 'pending'
          AND expires_at <= ${now}
      `;
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          recipient_hint: string | null;
          status: string;
          expires_at: Date;
          created_at: Date;
        }>
      >`
        SELECT id, recipient_hint, status, expires_at, created_at
        FROM guardme.invitations
        WHERE profile_id = ${profileId}::uuid
          AND status = 'pending'
        ORDER BY created_at
      `;
      return rows.map((row) => ({
        id: row.id,
        recipientHint: row.recipient_hint,
        status: row.status,
        expiresAt: row.expires_at.toISOString(),
        createdAt: row.created_at.toISOString(),
      }));
    });
  }

  withdraw(principal: Principal, invitationId: string): Promise<void> {
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const updated = await tx.$executeRaw`
        UPDATE guardme.invitations
        SET status = 'withdrawn'
        WHERE id = ${invitationId}::uuid
          AND status = 'pending'
      `;
      if (updated > 0) return;
      const rows = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT status FROM guardme.invitations WHERE id = ${invitationId}::uuid
      `;
      const status = rows[0]?.status;
      if (!status) throw new DomainError('NOT_FOUND');
      throw new DomainError('INCOMPATIBLE_STATE', undefined, { status });
    });
  }

  accept(
    principal: Principal,
    input: AcceptInvitationDto,
  ): Promise<{ access: ProfileAccessView; replay: boolean }> {
    if (principal.isAnonymous) throw new DomainError('FORBIDDEN_ACTION');
    const now = this.clock.now();
    return this.db.asOnboarding(toAccountContext(principal), async (tx) => {
      const invitation = await this.lockInvitation(
        tx,
        hashSecret(input.secret),
      );
      if (
        invitation.status === 'accepted' &&
        invitation.consumed_by_account_id === principal.accountId
      ) {
        const access = await this.accessById(tx, invitation.created_access_id);
        return { access, replay: true };
      }
      if (invitation.status === 'accepted') throw new DomainError('NOT_FOUND');
      if (invitation.status === 'pending' && invitation.expires_at <= now) {
        await tx.$executeRaw`
          UPDATE guardme.invitations
          SET status = 'expired'
          WHERE id = ${invitation.id}::uuid
        `;
        throw new DomainError('INCOMPATIBLE_STATE', undefined, {
          status: 'expired',
        });
      }
      if (invitation.status !== 'pending') {
        throw new DomainError('INCOMPATIBLE_STATE', undefined, {
          status: invitation.status,
        });
      }
      const existing = await tx.$queryRaw<
        Array<{
          id: string;
          profile_id: string;
          relation: 'user' | 'caregiver';
          caregiver_category: 'family' | 'medical' | null;
        }>
      >`
        SELECT id, profile_id, relation, caregiver_category
        FROM guardme.profile_access
        WHERE account_id = ${principal.accountId}::uuid
          AND profile_id = ${invitation.profile_id}::uuid
          AND status = 'active'
      `;
      let access = existing[0] ? toAccess(existing[0]) : undefined;
      if (!access) {
        const inserted = await tx.$queryRaw<
          Array<{
            id: string;
            profile_id: string;
            relation: 'user' | 'caregiver';
            caregiver_category: 'family' | 'medical' | null;
          }>
        >`
          INSERT INTO guardme.profile_access (
            account_id, profile_id, relation, caregiver_category, granted_via
          )
          VALUES (
            ${principal.accountId}::uuid,
            ${invitation.profile_id}::uuid,
            'caregiver',
            ${input.caregiverCategory},
            'invitation'
          )
          RETURNING id, profile_id, relation, caregiver_category
        `;
        const row = inserted[0];
        if (!row) throw new DomainError('NOT_FOUND');
        access = toAccess(row);
      }
      await tx.$executeRaw`
        UPDATE guardme.invitations
        SET status = 'accepted',
            consumed_by_account_id = ${principal.accountId}::uuid,
            consumed_at = ${now},
            created_access_id = ${access.accessId}::uuid
        WHERE id = ${invitation.id}::uuid
      `;
      await this.sync.requestSyncSignal(tx, invitation.profile_id, 'changes');
      await this.audit.record(tx, {
        operation: 'invitation.accept',
        result: 'ok',
        actorKind: 'account',
        actorAccountId: principal.accountId,
        profileId: invitation.profile_id,
        details: { invitationId: invitation.id },
      });
      return { access, replay: false };
    });
  }

  reject(principal: Principal, secret: string): Promise<void> {
    if (principal.isAnonymous) throw new DomainError('FORBIDDEN_ACTION');
    const now = this.clock.now();
    return this.db.asOnboarding(toAccountContext(principal), async (tx) => {
      const invitation = await this.lockInvitation(tx, hashSecret(secret));
      if (invitation.status === 'pending' && invitation.expires_at <= now) {
        await tx.$executeRaw`
          UPDATE guardme.invitations SET status = 'expired' WHERE id = ${invitation.id}::uuid
        `;
        throw new DomainError('INCOMPATIBLE_STATE', undefined, {
          status: 'expired',
        });
      }
      if (invitation.status !== 'pending') {
        throw new DomainError('INCOMPATIBLE_STATE', undefined, {
          status: invitation.status,
        });
      }
      await tx.$executeRaw`
        UPDATE guardme.invitations
        SET status = 'rejected'
        WHERE id = ${invitation.id}::uuid
      `;
    });
  }

  private async lockInvitation(
    tx: Tx,
    secretHash: string,
  ): Promise<InvitationRow> {
    const rows = await tx.$queryRaw<InvitationRow[]>`
      SELECT id, profile_id, status, expires_at, consumed_by_account_id, created_access_id
      FROM guardme.invitations
      WHERE secret_hash = ${secretHash}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) throw new DomainError('NOT_FOUND');
    return row;
  }

  private async accessById(
    tx: Tx,
    accessId: string | null,
  ): Promise<ProfileAccessView> {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        profile_id: string;
        relation: 'user' | 'caregiver';
        caregiver_category: 'family' | 'medical' | null;
      }>
    >`
      SELECT id, profile_id, relation, caregiver_category
      FROM guardme.profile_access
      WHERE id = ${accessId}::uuid
    `;
    const row = rows[0];
    if (!row) throw new DomainError('NOT_FOUND');
    return toAccess(row);
  }
}
