import { forwardRef, Module } from '@nestjs/common';
import { PolicyConfig } from '../../config/policy.config';
import { ClockPort } from '../../infra/clock/clock.port';
import { SystemClock } from '../../infra/clock/system-clock';
import { CallingModule } from '../calling/calling.module';
import { FollowupsModule } from '../followups/followups.module';
import { LocationModule } from '../location/location.module';
import { DevicesModule } from '../devices/devices.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PendingActionsModule } from '../pending-actions/pending-actions.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { DecisionsController } from './decisions.controller';
import { DecisionsService } from './decisions.service';
import {
  PostponeCollectiveHandler,
  PostponeReminderHandler,
} from './handlers/postpone.handlers';
import { IncidentEventsService } from './incident-events.service';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';

export const POSTPONE_HANDLERS = Symbol('POSTPONE_HANDLERS');

@Module({
  imports: [
    forwardRef(() => DevicesModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => CallingModule),
    forwardRef(() => FollowupsModule),
    forwardRef(() => LocationModule),
    ProfilesModule,
    PendingActionsModule,
  ],
  controllers: [IncidentsController, DecisionsController],
  providers: [
    IncidentsService,
    IncidentEventsService,
    DecisionsService,
    PostponeReminderHandler,
    PostponeCollectiveHandler,
    PolicyConfig,
    { provide: ClockPort, useClass: SystemClock },
    {
      provide: POSTPONE_HANDLERS,
      useFactory: (
        reminder: PostponeReminderHandler,
        collective: PostponeCollectiveHandler,
      ) => [reminder, collective],
      inject: [PostponeReminderHandler, PostponeCollectiveHandler],
    },
  ],
  exports: [IncidentEventsService, POSTPONE_HANDLERS],
})
export class IncidentsModule {}
