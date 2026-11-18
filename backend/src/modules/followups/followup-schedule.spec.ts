import {
  firstQuestionAt,
  lastQuestionAt,
  plusSeconds,
} from './followup-schedule';

describe('followup schedule', () => {
  it('uses the next Panama morning even when the close is before 7:00', () => {
    expect(
      firstQuestionAt(
        new Date('2026-11-16T11:30:00.000Z'),
        'America/Panama',
        7,
      ).toISOString(),
    ).toBe('2026-11-17T12:00:00.000Z');
    expect(
      firstQuestionAt(
        new Date('2026-11-17T02:00:00.000Z'),
        'America/Panama',
        7,
      ).toISOString(),
    ).toBe('2026-11-17T12:00:00.000Z');
  });

  it('counts calendar days from the negative answer', () => {
    expect(
      lastQuestionAt(
        new Date('2026-11-17T12:00:00.000Z'),
        'America/Panama',
        7,
        3,
      ).toISOString(),
    ).toBe('2026-11-20T12:00:00.000Z');
  });

  it('moves a missing New York hour to the next valid hour', () => {
    expect(
      firstQuestionAt(
        new Date('2026-03-08T03:00:00.000Z'),
        'America/New_York',
        2,
      ).toISOString(),
    ).toBe('2026-03-08T07:00:00.000Z');
  });

  it('adds seconds without changing the calendar rule', () => {
    const from = new Date('2026-11-17T12:00:00.000Z');
    expect(plusSeconds(from, 7200).toISOString()).toBe(
      '2026-11-17T14:00:00.000Z',
    );
  });
});
