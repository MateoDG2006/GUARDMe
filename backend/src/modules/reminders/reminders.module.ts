import { Module } from '@nestjs/common';
import { PolicyConfig } from '../../config/policy.config';
import { ClockPort } from '../../infra/clock/clock.port';
import { SystemClock } from '../../infra/clock/system-clock';
import { AuditModule } from '../audit/audit.module';
import { SyncModule } from '../sync/sync.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { OccurrenceHorizonJob } from './occurrence-horizon.job';
import { OccurrencesController } from './occurrences.controller';
import { OccurrencesService } from './occurrences.service';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

@Module({
  imports: [AuditModule, ProfilesModule, SyncModule],
  controllers: [RemindersController, OccurrencesController],
  providers: [
    RemindersService,
    OccurrencesService,
    OccurrenceHorizonJob,
    PolicyConfig,
    { provide: ClockPort, useClass: SystemClock },
  ],
  exports: [OccurrenceHorizonJob],
})
export class RemindersModule {}
