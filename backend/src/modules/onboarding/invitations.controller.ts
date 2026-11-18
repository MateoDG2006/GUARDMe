import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Throttle } from '../../common/throttle/named-throttle';
import type { Principal } from '../identity/principal';
import {
  AcceptInvitationDto,
  IssueInvitationDto,
  RejectInvitationDto,
} from './dto/invitation.dto';
import { InvitationsService } from './invitations.service';

@Controller()
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post('profiles/:id/invitations')
  @Throttle('invitations')
  issue(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: IssueInvitationDto,
  ) {
    return this.invitations.issue(principal, id, input);
  }

  @Get('profiles/:id/invitations')
  list(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invitations.listPending(principal, id);
  }

  @Delete('invitations/:id')
  @HttpCode(204)
  withdraw(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.invitations.withdraw(principal, id);
  }

  @Post('invitations/accept')
  @Throttle('secrets')
  async accept(
    @CurrentPrincipal() principal: Principal,
    @Body() input: AcceptInvitationDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.invitations.accept(principal, input);
    response.status(result.replay ? 200 : 201);
    return result.access;
  }

  @Post('invitations/reject')
  @HttpCode(204)
  @Throttle('secrets')
  reject(
    @CurrentPrincipal() principal: Principal,
    @Body() input: RejectInvitationDto,
  ): Promise<void> {
    return this.invitations.reject(principal, input.secret);
  }
}
