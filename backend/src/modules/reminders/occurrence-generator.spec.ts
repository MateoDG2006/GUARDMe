import { generateOccurrences } from './occurrence-generator';

const mondayWednesday = {
  id: 'schedule-1',
  localTime: '08:00',
  daysOfWeek: [1, 3],
  timeZone: 'America/Panama',
  validFrom: '2026-11-01',
  validTo: null,
};

describe('generateOccurrences', () => {
  it('places Panama Monday and Wednesday at 13:00 UTC', () => {
    const dates = generateOccurrences(
      mondayWednesday,
      new Date('2026-11-16T15:00:00.000Z'),
      new Date('2026-11-23T15:00:00.000Z'),
    );
    expect(dates.map((date) => date.toISOString())).toEqual([
      '2026-11-18T13:00:00.000Z',
      '2026-11-23T13:00:00.000Z',
    ]);
  });

  it('respects validTo and single weekdays', () => {
    const dates = generateOccurrences(
      {
        ...mondayWednesday,
        daysOfWeek: [1],
        validTo: '2026-11-16',
      },
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-11-30T00:00:00.000Z'),
    );
    expect(dates.map((date) => date.toISOString())).toEqual([
      '2026-11-02T13:00:00.000Z',
      '2026-11-09T13:00:00.000Z',
      '2026-11-16T13:00:00.000Z',
    ]);
  });

  it('moves a missing New York hour forward and keeps the first repeated hour', () => {
    const missing = generateOccurrences(
      {
        id: 'dst-gap',
        localTime: '02:30',
        daysOfWeek: [7],
        timeZone: 'America/New_York',
        validFrom: '2026-03-08',
        validTo: '2026-03-08',
      },
      new Date('2026-03-08T00:00:00.000Z'),
      new Date('2026-03-09T00:00:00.000Z'),
    );
    expect(missing.map((date) => date.toISOString())).toEqual([
      '2026-03-08T07:30:00.000Z',
    ]);
    const repeated = generateOccurrences(
      {
        id: 'dst-overlap',
        localTime: '01:30',
        daysOfWeek: [7],
        timeZone: 'America/New_York',
        validFrom: '2026-11-01',
        validTo: '2026-11-01',
      },
      new Date('2026-11-01T00:00:00.000Z'),
      new Date('2026-11-02T00:00:00.000Z'),
    );
    expect(repeated.map((date) => date.toISOString())).toEqual([
      '2026-11-01T05:30:00.000Z',
    ]);
  });
});
