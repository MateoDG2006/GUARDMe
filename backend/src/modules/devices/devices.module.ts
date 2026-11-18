import { forwardRef, Module } from '@nestjs/common';
import { PolicyConfig } from '../../config/policy.config';
import { ClockPort } from '../../infra/clock/clock.port';
import { SystemClock } from '../../infra/clock/system-clock';
import { AuditModule } from '../audit/audit.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { CanesController } from './canes.controller';
import { CanesService } from './canes.service';
import { GatewayEventsController } from './gateway-events.controller';
import { GatewayEventsService } from './gateway-events.service';
import { GatewayResolverService } from './gateway-resolver.service';
import { GatewaysService } from './gateways.service';

@Module({
  imports: [
    AuditModule,
    forwardRef(() => ProfilesModule),
    forwardRef(() => IncidentsModule),
  ],
  controllers: [CanesController, GatewayEventsController],
  providers: [
    CanesService,
    GatewaysService,
    GatewayResolverService,
    GatewayEventsService,
    PolicyConfig,
    { provide: ClockPort, useClass: SystemClock },
  ],
  exports: [CanesService, GatewaysService, GatewayResolverService],
})
export class DevicesModule {}
