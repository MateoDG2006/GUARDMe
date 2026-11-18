import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { RequireInstallation } from '../../common/decorators/require-installation.decorator';
import type { Principal } from '../identity/principal';
import { RespondOccurrenceDto } from './dto/reminder.dto';
import { OccurrencesService } from './occurrences.service';

@Controller()
export class OccurrencesController {
  constructor(private readonly occurrences: OccurrencesService) {}

  @Get('profiles/:id/occurrences')
  window(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.occurrences.window(principal, id, { from, to });
  }

  @Post('occurrences/:id/responses')
  @RequireInstallation()
  @HttpCode(200)
  respond(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: RespondOccurrenceDto,
  ) {
    return this.occurrences.respond(principal, id, input);
  }
}
