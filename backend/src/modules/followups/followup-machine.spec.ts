import { nextFollowupStep, type FollowupStatus } from './followup-machine';

describe('followup machine', () => {
  const cells: Array<{
    status: FollowupStatus;
    round: 'first' | 'caregiver' | 'last';
    event: 'well' | 'no_followup_needed' | 'not_well' | 'deadline';
    statusAfter: FollowupStatus;
    createRound?: 'caregiver' | 'last';
    encouragement?: boolean;
  }> = [
    {
      status: 'awaiting_user',
      round: 'first',
      event: 'well',
      statusAfter: 'closed_ok',
    },
    {
      status: 'awaiting_user',
      round: 'first',
      event: 'no_followup_needed',
      statusAfter: 'closed_no_followup',
    },
    {
      status: 'awaiting_user',
      round: 'first',
      event: 'not_well',
      statusAfter: 'awaiting_last',
      createRound: 'last',
    },
    {
      status: 'awaiting_user',
      round: 'first',
      event: 'deadline',
      statusAfter: 'awaiting_caregiver',
      createRound: 'caregiver',
    },
    {
      status: 'awaiting_caregiver',
      round: 'caregiver',
      event: 'well',
      statusAfter: 'closed_ok',
    },
    {
      status: 'awaiting_caregiver',
      round: 'caregiver',
      event: 'no_followup_needed',
      statusAfter: 'closed_no_followup',
    },
    {
      status: 'awaiting_caregiver',
      round: 'caregiver',
      event: 'not_well',
      statusAfter: 'awaiting_last',
      createRound: 'last',
    },
    {
      status: 'awaiting_caregiver',
      round: 'caregiver',
      event: 'deadline',
      statusAfter: 'closed_inconclusive',
    },
    {
      status: 'awaiting_last',
      round: 'last',
      event: 'well',
      statusAfter: 'closed_ok',
    },
    {
      status: 'awaiting_last',
      round: 'last',
      event: 'no_followup_needed',
      statusAfter: 'closed_no_followup',
    },
    {
      status: 'awaiting_last',
      round: 'last',
      event: 'not_well',
      statusAfter: 'closed_encouraged',
      encouragement: true,
    },
    {
      status: 'awaiting_last',
      round: 'last',
      event: 'deadline',
      statusAfter: 'closed_inconclusive',
    },
  ];

  it.each(cells)('$status $round $event', (cell) => {
    const event =
      cell.event === 'deadline'
        ? ({ kind: 'deadline' } as const)
        : ({ kind: 'answer', option: cell.event } as const);
    const step = nextFollowupStep(cell.status, cell.round, event);
    expect(step.status).toBe(cell.statusAfter);
    expect(step.createRound).toBe(cell.createRound);
    expect(step.showEncouragement ?? false).toBe(cell.encouragement ?? false);
    if (cell.statusAfter.startsWith('closed_')) {
      expect(step.closeAs).toBe(cell.statusAfter);
    }
  });
});
