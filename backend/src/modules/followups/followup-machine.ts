export type FollowupStatus =
  | 'scheduled'
  | 'awaiting_user'
  | 'awaiting_caregiver'
  | 'awaiting_last'
  | 'closed_ok'
  | 'closed_no_followup'
  | 'closed_encouraged'
  | 'closed_inconclusive';

export type FollowupRound = 'first' | 'caregiver' | 'last';

export type FollowupOption = 'well' | 'not_well' | 'no_followup_needed';

export type FollowupEvent =
  { kind: 'answer'; option: FollowupOption } | { kind: 'deadline' };

export interface FollowupStep {
  status: FollowupStatus;
  createRound?: 'caregiver' | 'last';
  closeAs?: FollowupStatus;
  showEncouragement?: boolean;
}

export function nextFollowupStep(
  status: FollowupStatus,
  round: FollowupRound,
  event: FollowupEvent,
): FollowupStep {
  if (event.kind === 'answer' && event.option === 'well') {
    return closed('closed_ok');
  }
  if (event.kind === 'answer' && event.option === 'no_followup_needed') {
    return closed('closed_no_followup');
  }
  if (status === 'awaiting_user' && round === 'first') {
    if (event.kind === 'answer') return open('awaiting_last', 'last');
    return open('awaiting_caregiver', 'caregiver');
  }
  if (status === 'awaiting_caregiver' && round === 'caregiver') {
    if (event.kind === 'answer') return open('awaiting_last', 'last');
    return closed('closed_inconclusive');
  }
  if (status === 'awaiting_last' && round === 'last') {
    if (event.kind === 'answer') {
      return { ...closed('closed_encouraged'), showEncouragement: true };
    }
    return closed('closed_inconclusive');
  }
  throw new Error(`Seguimiento sin transición: ${status}/${round}`);
}

function closed(status: FollowupStatus): FollowupStep {
  return { status, closeAs: status };
}

function open(
  status: FollowupStatus,
  createRound: 'caregiver' | 'last',
): FollowupStep {
  return { status, createRound };
}
