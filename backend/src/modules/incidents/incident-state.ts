import { DomainError } from '../../common/errors/domain-error';

export const INCIDENT_STATUSES = [
  'pending_contact',
  'contacting',
  'caregiver_informed',
  'attention_postponed',
  'escalation_required',
  'closed_assisted',
  'delayed_review',
] as const;

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_EVENT_TYPES = [
  'activated',
  'delayed_registered',
  'notification_scheduled',
  'late_cancellation_received',
  'call_plan_created',
  'call_attempt_requested',
  'call_attempt_result',
  'transport_answered',
  'caregiver_informed',
  'decision_take_charge',
  'decision_postpone',
  'decision_request_emergency',
  'escalation_required',
  'closed_assisted',
  'followup_created',
  'postpone_reminder_sent',
  'postpone_collective_sent',
  'emergency_dialer_opened',
  'call_attempt_skipped',
  'human_confirm_timeout',
  'late_transport_answer',
  'call_plan_stopped',
  'call_plan_exhausted',
] as const;

export type IncidentEventType = (typeof INCIDENT_EVENT_TYPES)[number];

const ALLOWED: Record<IncidentStatus, readonly IncidentStatus[]> = {
  pending_contact: [
    'contacting',
    'caregiver_informed',
    'attention_postponed',
    'escalation_required',
    'closed_assisted',
  ],
  contacting: [
    'pending_contact',
    'caregiver_informed',
    'attention_postponed',
    'escalation_required',
    'closed_assisted',
  ],
  caregiver_informed: [
    'attention_postponed',
    'escalation_required',
    'closed_assisted',
  ],
  attention_postponed: ['escalation_required', 'closed_assisted'],
  escalation_required: ['attention_postponed', 'closed_assisted'],
  delayed_review: [
    'attention_postponed',
    'escalation_required',
    'closed_assisted',
  ],
  closed_assisted: [],
};

export function assertTransition(
  from: IncidentStatus,
  to: IncidentStatus,
): void {
  if (!ALLOWED[from].includes(to)) {
    throw new DomainError('INCOMPATIBLE_STATE', undefined, { from, to });
  }
}
