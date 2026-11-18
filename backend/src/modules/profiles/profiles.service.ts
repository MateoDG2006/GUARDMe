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
  ageYears: number | null;
  height: string | null;
  weight: string | null;
  conditions: string | null;
  allergies: string | null;
  bloodType: string | null;
  address: string | null;
  phone: string | null;
  doctor: string | null;
  insurance: string | null;
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
  age_years: number | null;
  height_text: string | null;
  weight_text: string | null;
  conditions_text: string | null;
  allergies_text: string | null;
  blood_type: string | null;
  address_text: string | null;
  phone_e164: string | null;
  doctor_name: string | null;
  insurance_text: string | null;
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
      const inserted = await tx.$queryRaw<ProfileRow[]>`
        INSERT INTO guardme.profiles (display_name, time_zone, created_by_account_id)
        VALUES (${input.displayName}, ${timeZone}, ${principal.accountId}::uuid)
        RETURNING id, display_name, time_zone, status, version,
          age_years, height_text, weight_text, conditions_text, allergies_text,
          blood_type, address_text, phone_e164, doctor_name, insurance_text
      `;
      const profile = inserted[0];
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
      const profile = await this.readProfile(tx, profileId);
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
      const current = await this.readProfile(tx, profileId);
      if (current.version !== input.expectedVersion) {
        throw new DomainError('VERSION_CONFLICT', undefined, {
          current: toProfile(current, access.relation),
        });
      }

      const next = {
        displayName: input.displayName ?? current.display_name,
        timeZone: input.timeZone ?? current.time_zone,
        ageYears:
          input.ageYears !== undefined ? input.ageYears : current.age_years,
        height:
          input.height !== undefined
            ? emptyToNull(input.height)
            : current.height_text,
        weight:
          input.weight !== undefined
            ? emptyToNull(input.weight)
            : current.weight_text,
        conditions:
          input.conditions !== undefined
            ? emptyToNull(input.conditions)
            : current.conditions_text,
        allergies:
          input.allergies !== undefined
            ? emptyToNull(input.allergies)
            : current.allergies_text,
        bloodType:
          input.bloodType !== undefined
            ? emptyToNull(input.bloodType)
            : current.blood_type,
        address:
          input.address !== undefined
            ? emptyToNull(input.address)
            : current.address_text,
        phone:
          input.phone !== undefined
            ? emptyToNull(input.phone)
            : current.phone_e164,
        doctor:
          input.doctor !== undefined
            ? emptyToNull(input.doctor)
            : current.doctor_name,
        insurance:
          input.insurance !== undefined
            ? emptyToNull(input.insurance)
            : current.insurance_text,
      };

      const updated = await tx.$queryRaw<ProfileRow[]>`
        UPDATE guardme.profiles
        SET display_name = ${next.displayName},
            time_zone = ${next.timeZone},
            age_years = ${next.ageYears},
            height_text = ${next.height},
            weight_text = ${next.weight},
            conditions_text = ${next.conditions},
            allergies_text = ${next.allergies},
            blood_type = ${next.bloodType},
            address_text = ${next.address},
            phone_e164 = ${next.phone},
            doctor_name = ${next.doctor},
            insurance_text = ${next.insurance}
        WHERE id = ${profileId}::uuid
          AND version = ${input.expectedVersion}
        RETURNING id, display_name, time_zone, status, version,
          age_years, height_text, weight_text, conditions_text, allergies_text,
          blood_type, address_text, phone_e164, doctor_name, insurance_text
      `;
      const profile = updated[0];
      if (profile) {
        await this.audit.record(tx, {
          operation: 'profile.update',
          result: 'ok',
          actorKind: 'account',
          actorAccountId: principal.accountId,
          profileId,
        });
        return toProfile(profile, access.relation);
      }
      const latest = await this.readProfile(tx, profileId);
      throw new DomainError('VERSION_CONFLICT', undefined, {
        current: toProfile(latest, access.relation),
      });
    });
  }

  private async readProfile(tx: Tx, profileId: string): Promise<ProfileRow> {
    const rows = await tx.$queryRaw<ProfileRow[]>`
      SELECT id, display_name, time_zone, status, version,
        age_years, height_text, weight_text, conditions_text, allergies_text,
        blood_type, address_text, phone_e164, doctor_name, insurance_text
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
    ageYears: row.age_years,
    height: row.height_text,
    weight: row.weight_text,
    conditions: row.conditions_text,
    allergies: row.allergies_text,
    bloodType: row.blood_type,
    address: row.address_text,
    phone: row.phone_e164,
    doctor: row.doctor_name,
    insurance: row.insurance_text,
  };
}

function emptyToNull(value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function assertTimeZone(value: string | undefined | null): void {
  if (value == null) return;
  if (!isIanaTimeZone(value)) {
    throw new DomainError('VALIDATION_FAILED', 'Validación fallida', {
      fields: [{ field: 'timeZone', messages: ['zona IANA inválida'] }],
    });
  }
}
