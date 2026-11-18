import type { PrismaClient } from '@prisma/client';

const TRUNCATE_SQL = `
  TRUNCATE TABLE
    guardme.notification_deliveries,
    guardme.notifications,
    guardme.caregiver_decisions,
    guardme.call_attempts,
    guardme.call_plans,
    guardme.provider_events,
    guardme.incident_events,
    guardme.incidents,
    guardme.cane_telemetry_latest,
    guardme.false_alarm_counters,
    guardme.event_receipts,
    guardme.contacts,
    guardme.gateways,
    guardme.cane_assignments,
    guardme.canes,
    guardme.onboarding_steps,
    guardme.invitations,
    guardme.supervised_enrollments,
    guardme.profile_access,
    guardme.location_latest,
    guardme.location_read_grants,
    guardme.location_consents,
    guardme.change_log,
    guardme.worker_heartbeats,
    guardme.followup_responses,
    guardme.followup_questions,
    guardme.followups,
    guardme.reminder_occurrences,
    guardme.reminder_schedules,
    guardme.reminders,
    guardme.profiles,
    guardme.installations,
    guardme.accounts,
    guardme.pending_actions,
    guardme.idempotency_keys,
    guardme.audit_log
`;

export async function truncateGuardme(prisma: PrismaClient): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await prisma.$executeRawUnsafe(TRUNCATE_SQL);
      await prisma.$executeRaw`TRUNCATE TABLE identity.users CASCADE`;
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('40P01') && !message.includes('deadlock')) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  throw lastError;
}
