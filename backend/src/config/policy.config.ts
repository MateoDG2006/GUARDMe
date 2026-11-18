import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const PENDING_POLICIES = [
  'PD-03',
  'PD-04',
  'PD-05',
  'PD-06',
  'PD-07',
  'PD-08',
  'PD-10',
  'PD-12',
] as const;

// PD-04 pendiente
const MIN_CONTACTS_POLICY = 'run_available';
// PD-03 pendiente
const ON_UNCONFIRMED_ANSWER = 'continue';
// PD-05 pendiente
const FALL_PUSH_RECIPIENTS = 'all_caregivers';
// PD-05 pendiente
const POSTPONE_COLLECTIVE_RECIPIENTS = 'all_caregivers';
// PD-07 pendiente
const FOLLOWUP_CAREGIVER_RECIPIENT = 'closing_caregiver' as const;
// PD-07 pendiente
const FOLLOWUP_LAST_RECIPIENT = 'user' as const;

@Injectable()
export class PolicyConfig {
  constructor(private readonly config: ConfigService) {}

  get pendingPolicies(): readonly string[] {
    return PENDING_POLICIES;
  }

  // PD-04 pendiente
  get callRingTimeoutSec(): number {
    return this.config.getOrThrow<number>('PD04_CALL_RING_TIMEOUT_SEC');
  }

  // PD-04 pendiente
  get callPauseBetweenAttemptsSec(): number {
    return this.config.getOrThrow<number>(
      'PD04_CALL_PAUSE_BETWEEN_ATTEMPTS_SEC',
    );
  }

  // PD-04 pendiente
  get minContactsPolicy(): string {
    return MIN_CONTACTS_POLICY;
  }

  // PD-03 pendiente
  get humanConfirmTimeoutSec(): number {
    return this.config.getOrThrow<number>('PD03_HUMAN_CONFIRM_TIMEOUT_SEC');
  }

  // PD-03 pendiente
  get onUnconfirmedAnswer(): string {
    return ON_UNCONFIRMED_ANSWER;
  }

  // PD-05 pendiente
  get fallPushRecipients(): string {
    return FALL_PUSH_RECIPIENTS;
  }

  // PD-05 pendiente
  get postponeCollectiveRecipients(): string {
    return POSTPONE_COLLECTIVE_RECIPIENTS;
  }

  get postponeReminderSec(): number {
    return this.config.getOrThrow<number>('PD06_POSTPONE_REMINDER_SEC');
  }

  // PD-06 pendiente
  get postponeCollectiveSec(): number {
    return this.config.getOrThrow<number>('PD06_POSTPONE_COLLECTIVE_SEC');
  }

  get followupUserWindowSec(): number {
    return this.config.getOrThrow<number>('PD07_FOLLOWUP_USER_WINDOW_SEC');
  }

  // PD-07 pendiente
  get followupCaregiverRecipient(): 'closing_caregiver' {
    return FOLLOWUP_CAREGIVER_RECIPIENT;
  }

  // PD-07 pendiente
  get followupLastRecipient(): 'user' {
    return FOLLOWUP_LAST_RECIPIENT;
  }

  // PD-07 pendiente
  get followupCaregiverWindowSec(): number {
    return this.config.getOrThrow<number>('PD07_FOLLOWUP_CAREGIVER_WINDOW_SEC');
  }

  // PD-07 pendiente
  get followupLastWindowSec(): number {
    return this.config.getOrThrow<number>('PD07_FOLLOWUP_LAST_WINDOW_SEC');
  }

  get occurrenceHorizonDays(): number {
    return this.config.getOrThrow<number>('OCCURRENCE_HORIZON_DAYS');
  }

  // PD-08 pendiente
  get occurrenceSnoozeSec(): number {
    return this.config.getOrThrow<number>('PD08_OCCURRENCE_SNOOZE_SEC');
  }

  // PD-08 pendiente
  get userCanEditCaregiverReminders(): boolean {
    return this.config.getOrThrow<boolean>(
      'PD08_USER_CAN_EDIT_CAREGIVER_REMINDERS',
    );
  }

  // PD-10 pendiente
  get maxIncidentAgeForCallsSec(): number {
    return this.config.getOrThrow<number>(
      'PD10_MAX_INCIDENT_AGE_FOR_CALLS_SEC',
    );
  }

  // PD-10 pendiente
  get eventReceiptRetentionDays(): number {
    return this.config.getOrThrow<number>('PD10_EVENT_RECEIPT_RETENTION_DAYS');
  }

  // PD-12 pendiente
  get caneProximityProofRequired(): boolean {
    return this.config.getOrThrow<boolean>(
      'PD12_CANE_PROXIMITY_PROOF_REQUIRED',
    );
  }

  get followupFirstLocalHour(): number {
    return this.config.getOrThrow<number>('FOLLOWUP_FIRST_LOCAL_HOUR');
  }

  get followupLastDelayDays(): number {
    return this.config.getOrThrow<number>('FOLLOWUP_LAST_DELAY_DAYS');
  }

  get defaultProfileTimeZone(): string {
    return this.config.getOrThrow<string>('DEFAULT_PROFILE_TIME_ZONE');
  }

  get caneLinkFreshSec(): number {
    return this.config.getOrThrow<number>('CANE_LINK_FRESH_SEC');
  }

  get defaultPhoneRegion(): string {
    return this.config.getOrThrow<string>('DEFAULT_PHONE_REGION');
  }

  get invitationTtlHours(): number {
    return this.config.getOrThrow<number>('INVITATION_TTL_HOURS');
  }

  get enrollmentCodeTtlMin(): number {
    return this.config.getOrThrow<number>('ENROLLMENT_CODE_TTL_MIN');
  }
}
