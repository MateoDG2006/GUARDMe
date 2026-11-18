import { Injectable, Module, type OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv } from './config/env.config';
import { PolicyConfig } from './config/policy.config';
import { ClockPort } from './infra/clock/clock.port';
import { SystemClock } from './infra/clock/system-clock';
import { DbModule } from './infra/db/db.module';
import { QueueModule } from './infra/queue/queue.module';
import { assertPushAllowed } from './infra/push/push.port';
import { CallingModule, CALL_HANDLERS } from './modules/calling/calling.module';
import {
  IncidentsModule,
  POSTPONE_HANDLERS,
} from './modules/incidents/incidents.module';
import {
  NOTIFICATION_HANDLERS,
  NotificationsModule,
} from './modules/notifications/notifications.module';
import {
  ACTION_HANDLERS,
  type ActionHandler,
} from './modules/pending-actions/action-handler';
import { DispatcherService } from './modules/pending-actions/dispatcher.service';
import { MaintenanceService } from './modules/pending-actions/maintenance.service';
import { PendingActionsModule } from './modules/pending-actions/pending-actions.module';
import { RelayService } from './modules/pending-actions/relay.service';
import {
  FOLLOWUP_HANDLERS,
  FollowupsModule,
} from './modules/followups/followups.module';
import { WorkerHeartbeatService } from './modules/health/worker-heartbeat.service';
import { SYNC_HANDLERS, SyncModule } from './modules/sync/sync.module';
import { RemindersModule } from './modules/reminders/reminders.module';

@Injectable()
class WorkerBootstrap implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    assertPushAllowed(
      this.config.getOrThrow<string>('NODE_ENV'),
      this.config.getOrThrow<string>('PUSH_PROVIDER'),
    );
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
        redact: [
          'req.headers.authorization',
          '*.push_token',
          '*.secret',
          '*.code',
          '*.lat',
          '*.lng',
          '*.phone',
        ],
        transport:
          process.env.NODE_ENV === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    }),
    DbModule.forWorker(),
    QueueModule,
    PendingActionsModule,
    IncidentsModule,
    NotificationsModule,
    CallingModule,
    RemindersModule,
    FollowupsModule,
    SyncModule,
  ],
  providers: [
    PolicyConfig,
    { provide: ClockPort, useClass: SystemClock },
    RelayService,
    DispatcherService,
    MaintenanceService,
    WorkerBootstrap,
    WorkerHeartbeatService,
    {
      provide: ACTION_HANDLERS,
      inject: [
        NOTIFICATION_HANDLERS,
        CALL_HANDLERS,
        POSTPONE_HANDLERS,
        FOLLOWUP_HANDLERS,
        SYNC_HANDLERS,
      ],
      useFactory: (
        notifications: ActionHandler[],
        calls: ActionHandler[],
        postpones: ActionHandler[],
        followups: ActionHandler[],
        sync: ActionHandler[],
      ) => [...notifications, ...calls, ...postpones, ...followups, ...sync],
    },
  ],
})
export class WorkerModule {}
