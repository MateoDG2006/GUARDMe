import { Module } from '@nestjs/common';
import { ClockPort } from '../../infra/clock/clock.port';
import { SystemClock } from '../../infra/clock/system-clock';
import { AuditModule } from '../audit/audit.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { SyncModule } from '../sync/sync.module';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';

@Module({
  imports: [AuditModule, ProfilesModule, SyncModule],
  controllers: [LocationController],
  providers: [LocationService, { provide: ClockPort, useClass: SystemClock }],
  exports: [LocationService],
})
export class LocationModule {}
