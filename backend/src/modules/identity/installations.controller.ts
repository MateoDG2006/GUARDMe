import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { IncomingMessage } from 'http';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { LogoutDto } from './dto/logout.dto';
import { RegisterInstallationDto } from './dto/register-installation.dto';
import { InstallationsService } from './installations.service';
import type { Principal } from './principal';

@Controller()
export class InstallationsController {
  constructor(private readonly installations: InstallationsService) {}

  @Post('installations')
  register(
    @CurrentPrincipal() principal: Principal,
    @Body() input: RegisterInstallationDto,
  ) {
    return this.installations.register(principal, input);
  }

  @Delete('installations/:id')
  @HttpCode(204)
  revoke(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.installations.revoke(principal, id, 'user_revoked');
  }

  @Post('session/logout')
  logout(
    @CurrentPrincipal() principal: Principal,
    @Body() input: LogoutDto,
    @Req() req: IncomingMessage,
  ) {
    return this.installations.logout(principal, input.scope, req.headers);
  }
}
