import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { PolicyConfig } from '../../config/policy.config';
import { DbService, type Tx } from '../../infra/db/db.service';
import { AuditService } from '../audit/audit.service';
import { toAccountContext, type Principal } from '../identity/principal';
import { AccessService, type Relation } from './access.service';
import {
  isIanaTimeZone,
  type CreateProfileDto,
} from './dto/create-profile.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';

export interface ProfileView {
  id: string;
  displayName: string;
  timeZone: string;
  status: string;
  version: number;
  myRelation: Relation;
}

export interface ProfileSummaryView {
  id: string;
  displayName: string;
  relation: Relation;
  caregiverCategory: 'family' | 'medical' | null;
}

interface ProfileRow {
  id: string;
  display_name: string;
  time_zone: string;
  status: string;
  version: number;
}

@Injectable()
export class ProfilesService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly policy: PolicyConfig,
  ) {}

  create(principal: Principal, input: CreateProfileDto): Promise<ProfileView> {
    assertTimeZone(input.timeZone);
    return this.db.asOnboarding(toAccountContext(principal), async (tx) => {
      const accounts = await tx.$queryRaw<Array<{ onboarding_kind: string }>>`
        SELECT onboarding_kind
        FROM guardme.accounts
        WHERE id = ${principal.accountId}::uuid
      `;
      const kind = accounts[0]?.onboarding_kind;
      if (!kind) throw new DomainError('ACCOUNT_NOT_BOOTSTRAPPED');
      if (input.relation === 'user' && kind !== 'self') {
        throw new DomainError('FORBIDDEN_ACTION');
      }
      const timeZone = input.timeZone ?? this.policy.defaultProfileTimeZone;
      const created = await tx.$queryRaw<ProfileRow[]>`
        INSERT INTO guardme.profiles (display_name, time_zone, created_by_account_id)
        VALUES (${input.displayName}, ${timeZone}, ${principal.accountId}::uuid)
        RETURNING id, display_name, time_zone, status, version
      `;
      const profile = created[0];
      if (!profile) throw new DomainError('NOT_FOUND');
      await tx.$executeRaw`
        INSERT INTO guardme.profile_access (
          account_id, profile_id, relation, caregiver_category, granted_via
        )
        VALUES (
          ${principal.accountId}::uuid,
          ${profile.id}::uuid,
          ${input.relation},
          ${input.caregiverCategory ?? null},
          'profile_creation'
        )
      `;
      await this.audit.record(tx, {
        operation: 'profile.create',
        result: 'ok',
        actorKind: 'account',
        actorAccountId: principal.accountId,
        profileId: profile.id,
        details: { relation: input.relation },
      });
      return toProfile(profile, input.relation);
    });
  }

  list(principal: Principal): Promise<ProfileSummaryView[]> {
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          display_name: string;
          relation: Relation;
          caregiver_category: 'family' | 'medical' | null;
        }>
      >`
        SELECT p.id, p.display_name, pa.relation, pa.caregiver_category
        FROM guardme.profiles p
        JOIN guardme.profile_access pa
          ON pa.profile_id = p.id
         AND pa.account_id = ${principal.accountId}::uuid
         AND pa.status = 'active'
        ORDER BY p.display_name
      `;
      return rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        relation: row.relation,
        caregiverCategory: row.caregiver_category,
      }));
    });
  }

  get(principal: Principal, profileId: string): Promise<ProfileView> {
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const access = await this.access.requireAccess(tx, profileId);
      const rows = await tx.$queryRaw<ProfileRow[]>`
        SELECT id, display_name, time_zone, status, version
        FROM guardme.profiles
        WHERE id = ${profileId}::uuid
      `;
      const profile = rows[0];
      if (!profile) throw new DomainError('NOT_FOUND');
      return toProfile(profile, access.relation);
    });
  }

  update(
    principal: Principal,
    profileId: string,
    input: UpdateProfileDto,
  ): Promise<ProfileView> {
    assertTimeZone(input.timeZone);
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const access = await this.access.requireAccess(tx, profileId);
      if (input.displayName === undefined && input.timeZone === undefined) {
        const current = await this.readProfile(tx, profileId);
        if (current.version !== input.expectedVersion) {
          throw new DomainError('VERSION_CONFLICT', undefined, { current });
        }
        return toProfile(current, access.relation);
      }
      const updated = await tx.$queryRaw<ProfileRow[]>`
        UPDATE guardme.profiles
        SET display_name = COALESCE(${input.displayName ?? null}, display_name),
            time_zone = COALESCE(${input.timeZone ?? null}, time_zone)
        WHERE id = ${profileId}::uuid
          AND version = ${input.expectedVersion}
        RETURNING id, display_name, time_zone, status, version
      `;
      const profile = updated[0];
      if (profile) return toProfile(profile, access.relation);
      const current = await this.readProfile(tx, profileId);
      throw new DomainError('VERSION_CONFLICT', undefined, {
        current: toProfile(current, access.relation),
      });
    });
  }

  private async readProfile(tx: Tx, profileId: string): Promise<ProfileRow> {
    const rows = await tx.$queryRaw<ProfileRow[]>`
      SELECT id, display_name, time_zone, status, version
      FROM guardme.profiles
      WHERE id = ${profileId}::uuid
    `;
    const profile = rows[0];
    if (!profile) throw new DomainError('NOT_FOUND');
    return profile;
  }
}

function toProfile(row: ProfileRow, relation: Relation): ProfileView {
  return {
    id: row.id,
    displayName: row.display_name,
    timeZone: row.time_zone,
    status: row.status,
    version: row.version,
    myRelation: relation,
  };
}

function assertTimeZone(value: string | undefined): void {
  if (value === undefined) return;
  if (!isIanaTimeZone(value)) {
    throw new DomainError('VALIDATION_FAILED', 'Validación fallida', {
      fields: [{ field: 'timeZone', messages: ['zona IANA inválida'] }],
    });
  }
}
