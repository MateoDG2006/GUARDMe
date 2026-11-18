import { Injectable } from '@nestjs/common';
import { PolicyConfig } from '../../config/policy.config';
import { ClockPort } from '../../infra/clock/clock.port';
import { DbService } from '../../infra/db/db.service';
import { generateOccurrences } from './occurrence-generator';
import { insertOccurrences } from './reminders.service';

@Injectable()
export class OccurrenceHorizonJob {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockPort,
    private readonly policy: PolicyConfig,
  ) {}

  async extend(now = this.clock.now()): Promise<void> {
    const until = new Date(
      now.getTime() + this.policy.occurrenceHorizonDays * 86_400_000,
    );
    await this.db.asWorker(async (tx) => {
      const schedules = await tx.$queryRaw<
        Array<{
          id: string;
          reminder_id: string;
          local_time: string;
          days_of_week: number[];
          time_zone: string;
          valid_from: string;
          valid_to: string | null;
        }>
      >`
        SELECT
          s.id, s.reminder_id, s.local_time::text AS local_time, s.days_of_week,
          s.time_zone, s.valid_from::text AS valid_from, s.valid_to::text AS valid_to
        FROM guardme.reminder_schedules s
        JOIN guardme.reminders r ON r.id = s.reminder_id
        WHERE s.status = 'active'
          AND r.status = 'active'
        ORDER BY s.id
        LIMIT 500
      `;
      for (const schedule of schedules) {
        const instants = generateOccurrences(
          {
            id: schedule.id,
            localTime: schedule.local_time.slice(0, 5),
            daysOfWeek: schedule.days_of_week,
            timeZone: schedule.time_zone,
            validFrom: schedule.valid_from,
            validTo: schedule.valid_to,
          },
          now,
          until,
        );
        await insertOccurrences(
          tx,
          schedule.reminder_id,
          schedule.id,
          instants,
        );
      }
    });
    // PD-08 pendiente: aviso al cuidador por falta de confirmación
  }
}
