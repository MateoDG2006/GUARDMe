import { forwardRef, Module } from '@nestjs/common';
import { PolicyConfig } from '../../config/policy.config';
import { ClockPort } from '../../infra/clock/clock.port';
import { SystemClock } from '../../infra/clock/system-clock';
import { NotificationsModule } from '../notifications/notifications.module';
import { PendingActionsModule } from '../pending-actions/pending-actions.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { FollowupsController } from './followups.controller';
import { FollowupsService } from './followups.service';
import { PublishQuestionHandler } from './handlers/publish-question.handler';
import { QuestionDeadlineHandler } from './handlers/question-deadline.handler';

export const FOLLOWUP_HANDLERS = Symbol('FOLLOWUP_HANDLERS');

@Module({
  imports: [
    forwardRef(() => NotificationsModule),
    PendingActionsModule,
    ProfilesModule,
  ],
  controllers: [FollowupsController],
  providers: [
    FollowupsService,
    PublishQuestionHandler,
    QuestionDeadlineHandler,
    PolicyConfig,
    { provide: ClockPort, useClass: SystemClock },
    {
      provide: FOLLOWUP_HANDLERS,
      useFactory: (
        publish: PublishQuestionHandler,
        deadline: QuestionDeadlineHandler,
      ) => [publish, deadline],
      inject: [PublishQuestionHandler, QuestionDeadlineHandler],
    },
  ],
  exports: [FollowupsService, FOLLOWUP_HANDLERS],
})
export class FollowupsModule {}
