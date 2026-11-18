import { forwardRef, Module } from '@nestjs/common';
import { PolicyConfig } from '../../config/policy.config';
import { ClockPort } from '../../infra/clock/clock.port';
import { SystemClock } from '../../infra/clock/system-clock';
import { AuditModule } from '../audit/audit.module';
import { SyncModule } from '../sync/sync.module';
import { DevicesModule } from '../devices/devices.module';
import { AccessService } from './access.service';
import { MembershipsController } from './memberships.controller';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

@Module({
  imports: [AuditModule, SyncModule, forwardRef(() => DevicesModule)],
  controllers: [ProfilesController, MembershipsController],
  providers: [
    ProfilesService,
    AccessService,
    PolicyConfig,
    { provide: ClockPort, useClass: SystemClock },
  ],
  exports: [AccessService, ProfilesService],
})
export class ProfilesModule {}
