import { Module } from '@nestjs/common';
import { ClockPort } from '../../infra/clock/clock.port';
import { SystemClock } from '../../infra/clock/system-clock';
import { PushModule } from '../../infra/push/push.module';
import { PendingActionsModule } from '../pending-actions/pending-actions.module';
import { SyncSignalHandler } from './handlers/sync-signal.handler';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncSignalService } from './sync-signal.service';

export const SYNC_HANDLERS = Symbol('SYNC_HANDLERS');

@Module({
  imports: [PendingActionsModule, PushModule],
  controllers: [SyncController],
  providers: [
    SyncService,
    SyncSignalService,
    SyncSignalHandler,
    { provide: ClockPort, useClass: SystemClock },
    {
      provide: SYNC_HANDLERS,
      useFactory: (handler: SyncSignalHandler) => [handler],
      inject: [SyncSignalHandler],
    },
  ],
  exports: [SyncSignalService, SYNC_HANDLERS],
})
export class SyncModule {}
