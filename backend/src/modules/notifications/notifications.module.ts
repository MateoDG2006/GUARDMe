import { forwardRef, Module } from '@nestjs/common';
import { ClockPort } from '../../infra/clock/clock.port';
import { SystemClock } from '../../infra/clock/system-clock';
import { PushModule } from '../../infra/push/push.module';
import { IncidentsModule } from '../incidents/incidents.module';
export const NOTIFICATION_HANDLERS = Symbol('NOTIFICATION_HANDLERS');
import { PendingActionsModule } from '../pending-actions/pending-actions.module';
import { NotifyIncidentHandler } from './handlers/notify-incident.handler';
import { SendNotificationHandler } from './handlers/send-notification.handler';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    PushModule,
    PendingActionsModule,
    forwardRef(() => IncidentsModule),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotifyIncidentHandler,
    SendNotificationHandler,
    { provide: ClockPort, useClass: SystemClock },
    {
      provide: NOTIFICATION_HANDLERS,
      useFactory: (
        incidents: NotifyIncidentHandler,
        sends: SendNotificationHandler,
      ) => [incidents, sends],
      inject: [NotifyIncidentHandler, SendNotificationHandler],
    },
  ],
  exports: [NotificationsService, NOTIFICATION_HANDLERS],
})
export class NotificationsModule {}
