import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Idempotent } from '../../common/idempotency/idempotent.decorator';
import { Throttle } from '../../common/throttle/named-throttle';
import type { Principal } from '../identity/principal';
import { DecisionsService } from './decisions.service';
import { DecideDto, EmergencyActionDto } from './dto/decision.dto';

@Controller()
export class DecisionsController {
  constructor(private readonly decisions: DecisionsService) {}

  @Post('incidents/:id/decisions')
  @Throttle('urgent')
  @Idempotent()
  async decide(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: DecideDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.decisions.decide(principal, id, input);
    response.status(result.replay ? 200 : 201);
    if (result.replay) response.setHeader('X-Idempotent-Replay', 'true');
    return result;
  }

  @Post('incidents/:id/emergency-actions')
  @HttpCode(204)
  recordEmergency(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: EmergencyActionDto,
  ): Promise<void> {
    return this.decisions.recordEmergencyAction(principal, id, input);
  }
}
