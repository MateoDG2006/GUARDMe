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
import type { Principal } from '../identity/principal';
import { RespondFollowupDto } from './dto/respond-followup.dto';
import { FollowupsService } from './followups.service';

@Controller()
export class FollowupsController {
  constructor(private readonly followups: FollowupsService) {}

  @Get('followups/pending')
  pending(@CurrentPrincipal() principal: Principal) {
    return this.followups.pendingForMe(principal);
  }

  @Post('followup-questions/:id/responses')
  @HttpCode(200)
  respond(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: RespondFollowupDto,
  ) {
    return this.followups.respond(principal, id, input);
  }
}
