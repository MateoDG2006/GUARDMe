import type { ProviderCallStatus } from '../../infra/telephony/telephony.port';

export const ATTEMPT_STATUSES = [
  'planned',
  'requesting',
  'ringing',
  'answered_transport',
  'human_confirmed',
  'answered_unconfirmed',
  'no_answer',
  'busy',
  'failed',
  'canceled',
  'uncertain',
  'skipped',
] as const;

export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const ACTIVE_ATTEMPT_STATUSES = [
  'requesting',
  'ringing',
  'answered_transport',
  'uncertain',
] as const;

const TERMINAL = new Set<AttemptStatus>([
  'human_confirmed',
  'answered_unconfirmed',
  'no_answer',
  'busy',
  'failed',
  'canceled',
  'skipped',
]);

export function providerRank(status: ProviderCallStatus): number {
  switch (status) {
    case 'queued':
      return 1;
    case 'ringing':
      return 2;
    case 'answered':
      return 3;
    case 'human_confirmed':
      return 4;
    default:
      return 5;
  }
}

export function isTerminalAttempt(status: AttemptStatus): boolean {
  return TERMINAL.has(status);
}

export function toAttemptStatus(
  current: AttemptStatus,
  event: ProviderCallStatus,
  lastRank = 0,
): AttemptStatus | 'unchanged' {
  if (providerRank(event) <= lastRank) return 'unchanged';
  if (isTerminalAttempt(current)) return 'unchanged';
  if (
    (current === 'requesting' || current === 'uncertain') &&
    event === 'queued'
  ) {
    return 'requesting';
  }
  if (
    (current === 'requesting' ||
      current === 'uncertain' ||
      current === 'ringing') &&
    event === 'ringing'
  ) {
    return 'ringing';
  }
  if (unanswered(current) && event === 'answered') return 'answered_transport';
  if (current === 'answered_transport' && event === 'human_confirmed') {
    return 'human_confirmed';
  }
  if (
    (current === 'answered_transport' || current === 'human_confirmed') &&
    event === 'completed'
  ) {
    return 'unchanged';
  }
  if (
    unanswered(current) &&
    (event === 'busy' ||
      event === 'no_answer' ||
      event === 'failed' ||
      event === 'canceled')
  ) {
    return event;
  }
  if (unanswered(current) && event === 'completed') return 'no_answer';
  return 'unchanged';
}

function unanswered(status: AttemptStatus): boolean {
  return (
    status === 'requesting' || status === 'uncertain' || status === 'ringing'
  );
}
