export const PENDING_ACTION_TYPES = [
  'NOTIFY_INCIDENT',
  'NOTIFY_INCIDENT_UPDATE',
  'START_NEXT_CALL_ATTEMPT',
  'RECONCILE_CALL_ATTEMPT',
  'CANCEL_ACTIVE_CALL',
  'HUMAN_CONFIRM_TIMEOUT',
  'CALL_RING_TIMEOUT',
  'POSTPONE_REMINDER',
  'POSTPONE_COLLECTIVE',
  'FOLLOWUP_PUBLISH_QUESTION',
  'FOLLOWUP_QUESTION_DEADLINE',
  'SEND_NOTIFICATION',
  'APPLY_PROVIDER_EVENT',
  'PUBLISH_REMINDER_OCCURRENCE',
  'SYNC_SIGNAL',
] as const;

export type PendingActionType = (typeof PENDING_ACTION_TYPES)[number];

export const MAINTENANCE_TASKS = [
  { name: 'cleanup-event-receipts', cron: '0 3 * * *' },
  { name: 'cleanup-idempotency-keys', cron: '15 3 * * *' },
  { name: 'expire-notifications', cron: '*/5 * * * *' },
  { name: 'extend-occurrence-horizon', cron: '0 * * * *' },
] as const;
