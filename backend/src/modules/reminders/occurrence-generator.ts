import { DateTime } from 'luxon';

export interface ScheduleSpec {
  id: string;
  localTime: string;
  daysOfWeek: number[];
  timeZone: string;
  validFrom: string;
  validTo: string | null;
}

export function generateOccurrences(
  schedule: ScheduleSpec,
  fromUtc: Date,
  toUtc: Date,
): Date[] {
  const [hour, minute] = schedule.localTime.split(':').map(Number);
  const days = new Set(schedule.daysOfWeek);
  const zone = schedule.timeZone;
  const validFrom = DateTime.fromISO(schedule.validFrom, { zone }).startOf(
    'day',
  );
  const validTo = schedule.validTo
    ? DateTime.fromISO(schedule.validTo, { zone }).startOf('day')
    : null;
  const first = DateTime.fromJSDate(fromUtc, { zone }).startOf('day').minus({
    days: 1,
  });
  const last = DateTime.fromJSDate(toUtc, { zone }).startOf('day').plus({
    days: 1,
  });
  const found = new Set<number>();
  for (let day = first; day <= last; day = day.plus({ days: 1 })) {
    if (day < validFrom) continue;
    if (validTo && day > validTo) continue;
    if (!days.has(day.weekday)) continue;
    const local = firstRepeatedHour(resolveLocalTime(day, hour, minute, zone));
    if (!local?.isValid) continue;
    const instant = local.toUTC().toJSDate();
    if (instant >= fromUtc && instant < toUtc) found.add(instant.getTime());
  }
  return [...found]
    .sort((left, right) => left - right)
    .map((time) => new Date(time));
}

function resolveLocalTime(
  day: DateTime,
  hour: number,
  minute: number,
  zone: string,
): DateTime | null {
  const parts = {
    year: day.year,
    month: day.month,
    day: day.day,
    minute,
    second: 0,
    millisecond: 0,
  };
  const built = DateTime.fromObject({ ...parts, hour }, { zone });
  if (built.isValid) return built;
  // Hora inexistente por el salto de horario: luxon la rechaza y se usa la siguiente hora válida.
  const shifted = DateTime.fromObject({ ...parts, hour: hour + 1 }, { zone });
  return shifted.isValid ? shifted : null;
}

function firstRepeatedHour(local: DateTime | null): DateTime | null {
  if (!local?.isValid) return local;
  const earlier = local.minus({ hours: 1 });
  if (
    earlier.isValid &&
    earlier.hour === local.hour &&
    earlier.minute === local.minute &&
    earlier.toMillis() < local.toMillis()
  ) {
    return earlier;
  }
  return local;
}
