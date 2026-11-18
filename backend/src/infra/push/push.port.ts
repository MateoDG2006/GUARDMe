export const NOTIFICATION_TYPES = [
  'incident_fall',
  'incident_manual',
  'incident_delayed',
  'incident_update',
  'postpone_reminder',
  'postpone_collective',
  'followup_question',
  'reminder_occurrence',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationPriority =
  'urgent' | 'attention' | 'agenda' | 'operational';

export interface PushMessage {
  token: string;
  notificationId: string;
  type: NotificationType | 'sync';
  priority: 'high' | 'normal';
  ttlSeconds: number;
  collapseKey: string;
  title?: string;
  body?: string;
  data: Record<string, string>;
}

export type PushResult =
  | { status: 'accepted'; providerRef: string }
  | { status: 'token_invalid' }
  | { status: 'retryable'; error: string }
  | { status: 'failed'; error: string };

export abstract class PushPort {
  abstract send(message: PushMessage): Promise<PushResult>;
}

export function assertPushAllowed(nodeEnv: string, provider: string): void {
  if (nodeEnv === 'production' && provider === 'fake') {
    throw new Error('PUSH_PROVIDER=fake no está permitido en producción');
  }
}
