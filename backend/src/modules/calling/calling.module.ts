import { forwardRef, Module } from '@nestjs/common';
import { PolicyConfig } from '../../config/policy.config';
import { ClockPort } from '../../infra/clock/clock.port';
import { SystemClock } from '../../infra/clock/system-clock';
import { TelephonyModule } from '../../infra/telephony/telephony.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { PendingActionsModule } from '../pending-actions/pending-actions.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { CallPlanService } from './call-plan.service';
import { DevTelephonyController } from './dev-telephony.controller';
import { ApplyProviderEventHandler } from './handlers/apply-provider-event.handler';
import { CancelActiveCallHandler } from './handlers/cancel-active-call.handler';
import { HumanConfirmTimeoutHandler } from './handlers/human-confirm-timeout.handler';
import { ReconcileAttemptHandler } from './handlers/reconcile-attempt.handler';
import { StartNextAttemptHandler } from './handlers/start-next-attempt.handler';
import { ProviderEventApplierService } from './provider-event-applier.service';
import { ProviderEventsController } from './provider-events.controller';
import { ProviderEventsService } from './provider-events.service';

export const CALL_HANDLERS = Symbol('CALL_HANDLERS');

const controllers =
  process.env.NODE_ENV === 'production'
    ? [ProviderEventsController]
    : [ProviderEventsController, DevTelephonyController];

@Module({
  imports: [
    TelephonyModule,
    PendingActionsModule,
    ProfilesModule,
    forwardRef(() => IncidentsModule),
  ],
  controllers,
  providers: [
    PolicyConfig,
    { provide: ClockPort, useClass: SystemClock },
    CallPlanService,
    ProviderEventApplierService,
    ProviderEventsService,
    StartNextAttemptHandler,
    ApplyProviderEventHandler,
    ReconcileAttemptHandler,
    CancelActiveCallHandler,
    HumanConfirmTimeoutHandler,
    {
      provide: CALL_HANDLERS,
      useFactory: (
        start: StartNextAttemptHandler,
        apply: ApplyProviderEventHandler,
        reconcile: ReconcileAttemptHandler,
        cancel: CancelActiveCallHandler,
        confirm: HumanConfirmTimeoutHandler,
      ) => [start, apply, reconcile, cancel, confirm],
      inject: [
        StartNextAttemptHandler,
        ApplyProviderEventHandler,
        ReconcileAttemptHandler,
        CancelActiveCallHandler,
        HumanConfirmTimeoutHandler,
      ],
    },
  ],
  exports: [CallPlanService, CALL_HANDLERS],
})
export class CallingModule {}
