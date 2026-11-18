import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { RequireInstallation } from '../../common/decorators/require-installation.decorator';
import { Throttle } from '../../common/throttle/named-throttle';
import { DomainError } from '../../common/errors/domain-error';
import type { Principal } from '../identity/principal';
import { ActivateIncidentDto } from './dto/activate-incident.dto';
import { IncidentsService } from './incidents.service';

@Controller()
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Post('incidents')
  @Throttle('urgent')
  @RequireInstallation()
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Body() input: ActivateIncidentDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.incidents.activate(principal, input);
    if (result.replay) {
      response.setHeader('X-Idempotent-Replay', 'true');
      response.status(200);
    } else {
      response.status(201);
    }
    return result.incident;
  }

  @Get('profiles/:id/incidents')
  list(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.incidents.listForProfile(principal, id, {
      cursor,
      limit: parseLimit(limit),
    });
  }

  @Get('incidents/:id/calls')
  calls(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.incidents.listCalls(principal, id);
  }

  @Get('incidents/:id')
  detail(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.incidents.getDetail(principal, id);
  }
}

function parseLimit(value: string | undefined): number | undefined {
  if (value == null || value === '') return undefined;
  if (!/^\d+$/.test(value)) {
    throw new DomainError('VALIDATION_FAILED', 'Validación fallida', {
      fields: [{ field: 'limit', messages: ['Entre 1 y 50'] }],
    });
  }
  return Number(value);
}
