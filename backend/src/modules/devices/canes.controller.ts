import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { RequireInstallation } from '../../common/decorators/require-installation.decorator';
import { Throttle } from '../../common/throttle/named-throttle';
import type { Principal } from '../identity/principal';
import { CanesService } from './canes.service';
import { ClaimCaneDto } from './dto/claim-cane.dto';
import { GatewaysService } from './gateways.service';

@Controller()
export class CanesController {
  constructor(
    private readonly canes: CanesService,
    private readonly gateways: GatewaysService,
  ) {}

  @Post('canes/claim')
  @Throttle('secrets')
  async claim(
    @CurrentPrincipal() principal: Principal,
    @Body() input: ClaimCaneDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.canes.claim(principal, input);
    response.status(result.replay ? 200 : 201);
    return result.cane;
  }

  @Post('canes/:id/release')
  @HttpCode(204)
  release(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.canes.release(principal, id);
  }

  @Post('canes/:id/gateway')
  @HttpCode(200)
  @RequireInstallation()
  gateway(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.gateways.setGateway(principal, id);
  }

  @Get('profiles/:id/canes')
  list(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.canes.listForProfile(principal, id);
  }
}
