import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { ClockPort } from '../../infra/clock/clock.port';
import { DbService, type Tx } from '../../infra/db/db.service';
import { toAccountContext, type Principal } from '../identity/principal';
import { AccessService } from '../profiles/access.service';
import type { ReportStepDto } from './dto/report-step.dto';

export type FlowKind = 'self' | 'caregiver';

export interface OnboardingStepView {
  step: string;
  status: 'pending' | 'done' | 'blocked' | 'skipped';
  reason: string | null;
  source: 'server' | 'device';
}

const SELF_STEPS = [
  'intent_selected',
  'account',
  'profile',
  'pin_set',
  'permissions_granted',
  'cane',
  'gateway',
  'contacts',
  'caregivers',
  'location_decision',
  'end_to_end_test',
] as const;

const CAREGIVER_STEPS = [
  'account',
  'intent_selected',
  'profile',
  'pin_set',
  'permissions_granted',
  'caregivers',
  'cane',
  'gateway',
  'contacts',
  'location_decision',
  'end_to_end_test',
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEVICE = new Set<string>([
  'intent_selected',
  'pin_set',
  'permissions_granted',
  'end_to_end_test',
]);

const WAITING_ON_LATER_PLAN = new Set<string>();

interface SetupState {
  cane: boolean;
  gateway: boolean;
  priorityContacts: number;
  locationDecision: boolean;
}

@Injectable()
export class OnboardingProgressService {
  constructor(
    private readonly db: DbService,
    private readonly access: AccessService,
    private readonly clock: ClockPort,
  ) {}

  get(
    principal: Principal,
    profileId: string | null,
  ): Promise<{ flow: FlowKind; steps: OnboardingStepView[] }> {
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      if (profileId && !UUID_RE.test(profileId)) {
        throw new DomainError('VALIDATION_FAILED', 'Validación fallida', {
          fields: [{ field: 'profileId', messages: ['UUID inválido'] }],
        });
      }
      const relation = profileId
        ? (await this.access.requireAccess(tx, profileId)).relation
        : await this.anyUserRelation(tx, principal.accountId);
      const flow: FlowKind = relation === 'user' ? 'self' : 'caregiver';
      const order = flow === 'self' ? SELF_STEPS : CAREGIVER_STEPS;
      const reported = await this.deviceSteps(
        tx,
        principal.accountId,
        profileId,
      );
      const caregivers = await this.caregivers(
        tx,
        principal.accountId,
        profileId,
      );
      const setup = await this.setup(tx, principal.accountId, profileId);
      const profileDone = profileId
        ? true
        : await this.anyAccess(tx, principal.accountId);
      const steps = order.map((step) =>
        this.compose(step, reported, caregivers, profileDone, setup),
      );
      return { flow, steps };
    });
  }

  report(
    principal: Principal,
    input: ReportStepDto,
  ): Promise<OnboardingStepView> {
    const now = this.clock.now();
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      if (input.profileId) await this.access.requireAccess(tx, input.profileId);
      await tx.$executeRaw`
        INSERT INTO guardme.onboarding_steps (
          account_id, profile_id, step, status, reason, updated_at
        )
        VALUES (
          ${principal.accountId}::uuid,
          ${input.profileId ?? null}::uuid,
          ${input.step},
          ${input.status},
          ${input.reason ?? null},
          ${now}
        )
        ON CONFLICT (account_id, profile_id, step) DO UPDATE
        SET status = EXCLUDED.status,
            reason = EXCLUDED.reason,
            updated_at = EXCLUDED.updated_at
      `;
      return {
        step: input.step,
        status: input.status,
        reason: input.reason ?? null,
        source: 'device',
      };
    });
  }

  private compose(
    step: string,
    reported: Map<
      string,
      { status: OnboardingStepView['status']; reason: string | null }
    >,
    caregivers: { otherAccess: boolean; pendingInvitation: boolean },
    profileDone: boolean,
    setup: SetupState,
  ): OnboardingStepView {
    if (DEVICE.has(step)) {
      const stored = reported.get(step);
      return {
        step,
        status: stored?.status ?? 'pending',
        reason: stored?.reason ?? null,
        source: 'device',
      };
    }
    if (WAITING_ON_LATER_PLAN.has(step)) {
      return {
        step,
        status: 'pending',
        reason: 'provider_not_integrated',
        source: 'server',
      };
    }
    if (step === 'account') {
      return { step, status: 'done', reason: null, source: 'server' };
    }
    if (step === 'profile') {
      return {
        step,
        status: profileDone ? 'done' : 'pending',
        reason: null,
        source: 'server',
      };
    }
    if (step === 'cane') {
      return {
        step,
        status: setup.cane ? 'done' : 'pending',
        reason: null,
        source: 'server',
      };
    }
    if (step === 'gateway') {
      return {
        step,
        status: setup.gateway ? 'done' : 'pending',
        reason: null,
        source: 'server',
      };
    }
    if (step === 'location_decision') {
      return {
        step,
        status: setup.locationDecision ? 'done' : 'pending',
        reason: null,
        source: 'server',
      };
    }
    if (step === 'contacts') {
      if (setup.priorityContacts < 0) {
        return { step, status: 'pending', reason: null, source: 'server' };
      }
      if (setup.priorityContacts >= 2) {
        return { step, status: 'done', reason: null, source: 'server' };
      }
      return {
        step,
        status: 'blocked',
        reason: 'missing_priority_contacts',
        source: 'server',
      };
    }
    if (caregivers.otherAccess) {
      return { step, status: 'done', reason: null, source: 'server' };
    }
    return {
      step,
      status: 'pending',
      reason: caregivers.pendingInvitation ? 'invitation_pending' : null,
      source: 'server',
    };
  }

  private async anyUserRelation(
    tx: Tx,
    accountId: string | null,
  ): Promise<'user' | null> {
    const rows = await tx.$queryRaw<Array<{ relation: string }>>`
      SELECT relation
      FROM guardme.profile_access
      WHERE account_id = ${accountId}::uuid
        AND relation = 'user'
        AND status = 'active'
      LIMIT 1
    `;
    return rows[0] ? 'user' : null;
  }

  private async anyAccess(tx: Tx, accountId: string | null): Promise<boolean> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM guardme.profile_access
      WHERE account_id = ${accountId}::uuid
        AND status = 'active'
      LIMIT 1
    `;
    return Boolean(rows[0]);
  }

  private async deviceSteps(
    tx: Tx,
    accountId: string | null,
    profileId: string | null,
  ): Promise<
    Map<string, { status: OnboardingStepView['status']; reason: string | null }>
  > {
    const rows = await tx.$queryRaw<
      Array<{
        step: string;
        status: 'done' | 'blocked' | 'skipped';
        reason: string | null;
      }>
    >`
      SELECT step, status, reason
      FROM guardme.onboarding_steps
      WHERE account_id = ${accountId}::uuid
        AND profile_id IS NOT DISTINCT FROM ${profileId}::uuid
    `;
    return new Map(
      rows.map((row) => [row.step, { status: row.status, reason: row.reason }]),
    );
  }

  private async setup(
    tx: Tx,
    accountId: string | null,
    profileId: string | null,
  ): Promise<SetupState> {
    if (!profileId) {
      return {
        cane: false,
        gateway: false,
        priorityContacts: -1,
        locationDecision: false,
      };
    }
    const rows = await tx.$queryRaw<
      Array<{
        cane: boolean;
        gateway: boolean;
        priority_contacts: number;
        location_decision: boolean;
      }>
    >`
      SELECT
        EXISTS (
          SELECT 1
          FROM guardme.cane_assignments
          WHERE profile_id = ${profileId}::uuid
            AND ended_at IS NULL
        ) AS cane,
        EXISTS (
          SELECT 1
          FROM guardme.gateways g
          JOIN guardme.cane_assignments a ON a.id = g.cane_assignment_id
          JOIN guardme.installations i ON i.id = g.installation_id
          WHERE a.profile_id = ${profileId}::uuid
            AND a.ended_at IS NULL
            AND g.ended_at IS NULL
            AND i.account_id = ${accountId}::uuid
        ) AS gateway,
        (
          SELECT count(*)::int
          FROM guardme.contacts
          WHERE profile_id = ${profileId}::uuid
            AND status = 'active'
            AND priority IS NOT NULL
        ) AS priority_contacts,
        EXISTS (
          SELECT 1
          FROM guardme.location_consents
          WHERE profile_id = ${profileId}::uuid
        ) AS location_decision
    `;
    return {
      cane: rows[0]?.cane === true,
      gateway: rows[0]?.gateway === true,
      priorityContacts: rows[0]?.priority_contacts ?? 0,
      locationDecision: rows[0]?.location_decision === true,
    };
  }

  private async caregivers(
    tx: Tx,
    accountId: string | null,
    profileId: string | null,
  ): Promise<{ otherAccess: boolean; pendingInvitation: boolean }> {
    if (!profileId) return { otherAccess: false, pendingInvitation: false };
    const now = this.clock.now();
    const rows = await tx.$queryRaw<
      Array<{ other_access: boolean; pending_invitation: boolean }>
    >`
      SELECT
        EXISTS (
          SELECT 1
          FROM guardme.profile_access
          WHERE profile_id = ${profileId}::uuid
            AND status = 'active'
            AND account_id <> ${accountId}::uuid
        ) AS other_access,
        EXISTS (
          SELECT 1
          FROM guardme.invitations
          WHERE profile_id = ${profileId}::uuid
            AND status = 'pending'
            AND expires_at > ${now}
        ) AS pending_invitation
    `;
    return {
      otherAccess: rows[0]?.other_access === true,
      pendingInvitation: rows[0]?.pending_invitation === true,
    };
  }
}
