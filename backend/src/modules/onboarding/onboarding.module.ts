import { Module } from '@nestjs/common';
import { PolicyConfig } from '../../config/policy.config';
import { ClockPort } from '../../infra/clock/clock.port';
import { SystemClock } from '../../infra/clock/system-clock';
import { AuditModule } from '../audit/audit.module';
import { SyncModule } from '../sync/sync.module';
import { DevicesModule } from '../devices/devices.module';
import { IdentityModule } from '../identity/identity.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { OnboardingProgressController } from './onboarding-progress.controller';
import { OnboardingProgressService } from './onboarding-progress.service';

@Module({
  imports: [
    AuditModule,
    IdentityModule,
    ProfilesModule,
    DevicesModule,
    SyncModule,
  ],
  controllers: [
    InvitationsController,
    EnrollmentsController,
    OnboardingProgressController,
  ],
  providers: [
    InvitationsService,
    EnrollmentsService,
    OnboardingProgressService,
    PolicyConfig,
    { provide: ClockPort, useClass: SystemClock },
  ],
})
export class OnboardingModule {}
