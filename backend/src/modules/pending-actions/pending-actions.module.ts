import { Module } from '@nestjs/common';
import { PendingActionsService } from './pending-actions.service';

@Module({
  providers: [PendingActionsService],
  exports: [PendingActionsService],
})
export class PendingActionsModule {}
