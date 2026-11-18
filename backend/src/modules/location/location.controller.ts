import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { RequireInstallation } from '../../common/decorators/require-installation.decorator';
import { Throttle } from '../../common/throttle/named-throttle';
import type { Principal } from '../identity/principal';
import { LocationConsentDto, PublishLocationDto } from './dto/location.dto';
import { LocationService } from './location.service';

@Controller()
export class LocationController {
  constructor(private readonly location: LocationService) {}

  @Get('profiles/:id/location-consent')
  consent(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.location.getConsent(principal, id);
  }

  @Put('profiles/:id/location-consent')
  setConsent(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: LocationConsentDto,
  ) {
    return this.location.setConsent(principal, id, input);
  }

  @Post('profiles/:id/location')
  @RequireInstallation()
  @Throttle('telemetry')
  publish(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: PublishLocationDto,
  ) {
    return this.location.publish(principal, id, input);
  }

  @Get('profiles/:id/location')
  latest(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.location.getLatest(principal, id);
  }

  @Post('profiles/:id/location/refresh-requests')
  @HttpCode(202)
  refresh(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.location.requestRefresh(principal, id);
  }
}
