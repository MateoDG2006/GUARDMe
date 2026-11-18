import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv } from './config/env.config';
import { PolicyConfig } from './config/policy.config';
import {
  CorrelationMiddleware,
  resolveCorrelationId,
} from './common/correlation/correlation.middleware';
import { ClockPort } from './infra/clock/clock.port';
import { SystemClock } from './infra/clock/system-clock';
import { DbModule } from './infra/db/db.module';
import { ThrottlerModule } from '@nestjs/throttler';
import {
  PrincipalThrottlerGuard,
  THROTTLERS,
} from './common/throttle/principal-throttler.guard';
import { AuditModule } from './modules/audit/audit.module';
import { HealthModule } from './modules/health/health.module';
import { AuthGuard } from './modules/identity/auth.guard';
import { IdentityModule } from './modules/identity/identity.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { DevicesModule } from './modules/devices/devices.module';
import { CallingModule } from './modules/calling/calling.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { PendingActionsModule } from './modules/pending-actions/pending-actions.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { LocationModule } from './modules/location/location.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { SyncModule } from './modules/sync/sync.module';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor';

const REDACT = [
  'req.headers.authorization',
  '*.push_token',
  '*.secret',
  '*.code',
  '*.lat',
  '*.lng',
  '*.phone',
  'req.body.phone',
  'req.body.items[*].phone',
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
        redact: REDACT,
        genReqId: (req) =>
          resolveCorrelationId(req.headers['x-correlation-id']),
        transport:
          process.env.NODE_ENV === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    }),
    DbModule.forApi(),
    AuditModule,
    PendingActionsModule,
    HealthModule,
    IdentityModule,
    ProfilesModule,
    OnboardingModule,
    DevicesModule,
    ContactsModule,
    IncidentsModule,
    CallingModule,
    NotificationsModule,
    RemindersModule,
    LocationModule,
    SyncModule,
    // shortcut: almacenamiento en memoria del throttler; con más de una instancia de API mover a almacenamiento compartido (plan 10).
    ThrottlerModule.forRoot(THROTTLERS),
  ],
  providers: [
    PolicyConfig,
    { provide: ClockPort, useClass: SystemClock },
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useClass: PrincipalThrottlerGuard },
    { provide: APP_INTERCEPTOR, useExisting: IdempotencyInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('{*path}');
  }
}
