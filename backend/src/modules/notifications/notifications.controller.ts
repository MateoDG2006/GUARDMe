import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { RequireInstallation } from '../../common/decorators/require-installation.decorator';
import { DomainError } from '../../common/errors/domain-error';
import type { Principal } from '../identity/principal';
import { AcknowledgeDto } from './dto/acknowledge.dto';
import { NotificationsService } from './notifications.service';

@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notifications')
  list(
    @CurrentPrincipal() principal: Principal,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.listMine(principal, {
      cursor,
      limit: parseLimit(limit),
    });
  }

  @Post('notifications/:id/acknowledgements')
  @RequireInstallation()
  acknowledge(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: AcknowledgeDto,
  ) {
    return this.notifications.acknowledge(principal, id, input.kind);
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
