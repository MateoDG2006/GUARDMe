import {
  forwardRef,
  Module,
  type OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { PolicyConfig } from '../../config/policy.config';
import { ClockPort } from '../../infra/clock/clock.port';
import { SystemClock } from '../../infra/clock/system-clock';
import { AuditModule } from '../audit/audit.module';
import { DevicesModule } from '../devices/devices.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { AuthGuard } from './auth.guard';
import { AUTH, createAuth, type AuthInstance } from './better-auth';
import { CapabilitiesService } from './capabilities.service';
import { InstallationsController } from './installations.controller';
import { InstallationsService } from './installations.service';

@Module({
  imports: [AuditModule, forwardRef(() => DevicesModule)],
  controllers: [AccountsController, InstallationsController],
  providers: [
    {
      provide: AUTH,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createAuth(config),
    },
    AuthGuard,
    AccountsService,
    InstallationsService,
    CapabilitiesService,
    IdempotencyInterceptor,
    PolicyConfig,
    { provide: ClockPort, useClass: SystemClock },
  ],
  exports: [
    AUTH,
    AuthGuard,
    IdempotencyInterceptor,
    CapabilitiesService,
    InstallationsService,
  ],
})
export class IdentityModule implements OnModuleDestroy {
  constructor(@Inject(AUTH) private readonly auth: AuthInstance) {}

  async onModuleDestroy(): Promise<void> {
    await this.auth.$disconnect();
  }
}
