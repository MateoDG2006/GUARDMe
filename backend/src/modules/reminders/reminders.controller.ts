import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Idempotent } from '../../common/idempotency/idempotent.decorator';
import { DomainError } from '../../common/errors/domain-error';
import type { Principal } from '../identity/principal';
import { CreateReminderDto, UpdateReminderDto } from './dto/reminder.dto';
import { RemindersService } from './reminders.service';

@Controller()
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get('profiles/:id/reminders')
  list(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.reminders.list(principal, id, {
      includeInactive: includeInactive === 'true',
    });
  }

  @Post('profiles/:id/reminders')
  @Idempotent()
  create(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CreateReminderDto,
  ) {
    return this.reminders.create(principal, id, input);
  }

  @Patch('reminders/:id')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateReminderDto,
  ) {
    return this.reminders.update(principal, id, input);
  }

  @Delete('reminders/:id')
  @HttpCode(204)
  deactivate(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('expectedVersion') expectedVersion?: string,
  ): Promise<void> {
    if (!expectedVersion || !/^\d+$/.test(expectedVersion)) {
      throw new DomainError('VALIDATION_FAILED', 'Validación fallida', {
        fields: [{ field: 'expectedVersion', messages: ['Obligatorio'] }],
      });
    }
    return this.reminders.deactivate(principal, id, Number(expectedVersion));
  }
}
