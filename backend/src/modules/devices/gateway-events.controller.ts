import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { RequireInstallation } from '../../common/decorators/require-installation.decorator';
import { Throttle } from '../../common/throttle/named-throttle';
import type { Principal } from '../identity/principal';
import { GatewayEventsBatchDto } from './dto/gateway-events.dto';
import { GatewayEventsService } from './gateway-events.service';

@Controller()
export class GatewayEventsController {
  constructor(private readonly events: GatewayEventsService) {}

  @Post('gateway-events')
  @Throttle('telemetry')
  @HttpCode(200)
  @RequireInstallation()
  ingest(
    @CurrentPrincipal() principal: Principal,
    @Body() input: GatewayEventsBatchDto,
  ) {
    return this.events.ingestBatch(principal, input);
  }

  @Get('profiles/:id/false-alarms')
  falseAlarms(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.events.listFalseAlarms(principal, id);
  }
}
