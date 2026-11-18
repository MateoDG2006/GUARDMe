import { DateTime } from 'luxon';

export function firstQuestionAt(
  closedAtUtc: Date,
  timeZone: string,
  localHour: number,
): Date {
  const closed = DateTime.fromJSDate(closedAtUtc, { zone: timeZone });
  return atLocalHour(
    closed.startOf('day').plus({ days: 1 }),
    localHour,
    timeZone,
  );
}

export function lastQuestionAt(
  negativeAnswerAtUtc: Date,
  timeZone: string,
  localHour: number,
  delayDays: number,
): Date {
  const answered = DateTime.fromJSDate(negativeAnswerAtUtc, {
    zone: timeZone,
  });
  // PD-07 pendiente
  return atLocalHour(
    answered.startOf('day').plus({ days: delayDays }),
    localHour,
    timeZone,
  );
}

export function plusSeconds(fromUtc: Date, seconds: number): Date {
  return new Date(fromUtc.getTime() + seconds * 1000);
}

function atLocalHour(day: DateTime, hour: number, zone: string): Date {
  const parts = {
    year: day.year,
    month: day.month,
    day: day.day,
    minute: 0,
    second: 0,
    millisecond: 0,
  };
  const built = DateTime.fromObject({ ...parts, hour }, { zone });
  const local = built.isValid
    ? built
    : DateTime.fromObject({ ...parts, hour: hour + 1 }, { zone });
  if (!local.isValid) throw new Error('Hora local inválida');
  const earlier = local.minus({ hours: 1 });
  const first =
    earlier.isValid &&
    earlier.hour === local.hour &&
    earlier.minute === local.minute &&
    earlier.toMillis() < local.toMillis()
      ? earlier
      : local;
  return first.toUTC().toJSDate();
}
