import { Injectable } from '@nestjs/common';
import { maskPhone } from '../contacts/phone';
import { PolicyConfig } from '../../config/policy.config';
import { ClockPort } from '../../infra/clock/clock.port';
import type { Tx } from '../../infra/db/db.service';
import { TelephonyPort } from '../../infra/telephony/telephony.port';
import { IncidentEventsService } from '../incidents/incident-events.service';
import { assertTransition } from '../incidents/incident-state';
import { PendingActionsService } from '../pending-actions/pending-actions.service';
import type { AttemptStatus } from './attempt-status';

export interface CallPlanIncident {
  id: string;
  profile_id: string;
  status: string;
  version: number;
}

export interface CallAttemptView {
  ordinal: number;
  contactName: string;
  contactPhoneMasked: string;
  status: AttemptStatus;
  statusReason: string | null;
  requestedAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  transportAnswered: boolean;
  humanConfirmed: boolean;
}

interface ContactRow {
  id: string;
  display_name: string;
  phone_e164: string;
  priority: number;
  linked_account_id: string | null;
}

@Injectable()
export class CallPlanService {
  constructor(
    private readonly clock: ClockPort,
    private readonly policy: PolicyConfig,
    private readonly events: IncidentEventsService,
    private readonly pending: PendingActionsService,
    private readonly telephony: TelephonyPort,
  ) {}

  async createForIncident(tx: Tx, incident: CallPlanIncident): Promise<void> {
    if (incident.status !== 'pending_contact') return;
    const contacts = await tx.$queryRaw<ContactRow[]>`
      SELECT id, display_name, phone_e164, priority, linked_account_id
      FROM guardme.contacts
      WHERE profile_id = ${incident.profile_id}::uuid
        AND status = 'active'
        AND priority IN (1, 2)
      ORDER BY priority
    `;
    if (contacts.length === 0) {
      // PD-04 pendiente
      assertTransition('pending_contact', 'escalation_required');
      await tx.$executeRaw`
        UPDATE guardme.incidents
        SET status = 'escalation_required', escalation_reason = 'no_contacts'
        WHERE id = ${incident.id}::uuid
      `;
      await this.events.append(tx, {
        incidentId: incident.id,
        type: 'escalation_required',
        actorKind: 'system',
        actorAccountId: null,
        actorInstallationId: null,
        context: { reason: 'no_contacts' },
      });
      await this.pending.enqueue(tx, {
        type: 'NOTIFY_INCIDENT_UPDATE',
        resourceType: 'incident',
        resourceId: incident.id,
        dedupeKey: `notify:incident:${incident.id}:no_contacts`,
        runAt: this.clock.now(),
      });
      return;
    }
    const snapshot = contacts.map((contact) => ({
      contactId: contact.id,
      displayName: contact.display_name,
      phoneE164: contact.phone_e164,
      priority: contact.priority,
      linkedAccountId: contact.linked_account_id,
    }));
    const plans = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO guardme.call_plans (
        incident_id, policy_version, contacts_snapshot, status
      )
      VALUES (
        ${incident.id}::uuid,
        ${`v1:${this.policy.minContactsPolicy}`},
        ${JSON.stringify(snapshot)}::jsonb,
        'active'
      )
      RETURNING id
    `;
    const planId = plans[0]?.id;
    if (!planId) return;
    let ordinal = 1;
    for (const contact of contacts) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await tx.$executeRaw`
          INSERT INTO guardme.call_attempts (
            call_plan_id, incident_id, ordinal, contact_id, contact_name,
            contact_phone_e164, linked_account_id, provider, status
          )
          VALUES (
            ${planId}::uuid,
            ${incident.id}::uuid,
            ${ordinal}::smallint,
            ${contact.id}::uuid,
            ${contact.display_name},
            ${contact.phone_e164},
            ${contact.linked_account_id}::uuid,
            ${this.telephony.provider},
            'planned'
          )
        `;
        ordinal += 1;
      }
    }
    await this.events.append(tx, {
      incidentId: incident.id,
      type: 'call_plan_created',
      actorKind: 'system',
      actorAccountId: null,
      actorInstallationId: null,
      context: { planId, attempts: ordinal - 1 },
    });
    await this.pending.enqueue(tx, {
      type: 'START_NEXT_CALL_ATTEMPT',
      resourceType: 'incident',
      resourceId: incident.id,
      dedupeKey: `call:${planId}:start:1`,
      runAt: this.clock.now(),
    });
  }

  async stopPlan(
    tx: Tx,
    incidentId: string,
    reason: 'caregiver_decision' | 'human_confirmed',
  ): Promise<{ activeAttemptId: string | null }> {
    const active = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM guardme.call_attempts
      WHERE incident_id = ${incidentId}::uuid
        AND status IN ('requesting', 'ringing', 'answered_transport', 'uncertain')
    `;
    await tx.$executeRaw`
      UPDATE guardme.call_plans
      SET status = 'stopped', stopped_reason = ${reason}
      WHERE incident_id = ${incidentId}::uuid
        AND status = 'active'
    `;
    await tx.$executeRaw`
      UPDATE guardme.call_attempts
      SET status = 'canceled', status_reason = 'superseded_by_decision'
      WHERE incident_id = ${incidentId}::uuid
        AND status = 'planned'
    `;
    await this.events.append(tx, {
      incidentId,
      type: 'call_plan_stopped',
      actorKind: 'system',
      actorAccountId: null,
      actorInstallationId: null,
      context: { reason },
    });
    return { activeAttemptId: active[0]?.id ?? null };
  }

  async listForIncident(
    tx: Tx,
    incidentId: string,
  ): Promise<CallAttemptView[]> {
    const rows = await tx.$queryRaw<
      Array<{
        ordinal: number;
        contact_name: string;
        contact_phone_e164: string;
        status: AttemptStatus;
        status_reason: string | null;
        requested_at: Date | null;
        answered_at: Date | null;
        ended_at: Date | null;
      }>
    >`
      SELECT
        ordinal, contact_name, contact_phone_e164, status, status_reason,
        requested_at, answered_at, ended_at
      FROM guardme.call_attempts
      WHERE incident_id = ${incidentId}::uuid
      ORDER BY ordinal
    `;
    return rows.map((row) => ({
      ordinal: row.ordinal,
      contactName: row.contact_name,
      contactPhoneMasked: maskPhone(row.contact_phone_e164),
      status: row.status,
      statusReason: row.status_reason,
      requestedAt: row.requested_at?.toISOString() ?? null,
      answeredAt: row.answered_at?.toISOString() ?? null,
      endedAt: row.ended_at?.toISOString() ?? null,
      transportAnswered:
        row.answered_at != null ||
        row.status === 'answered_transport' ||
        row.status === 'answered_unconfirmed' ||
        row.status === 'human_confirmed',
      humanConfirmed: row.status === 'human_confirmed',
    }));
  }
}
