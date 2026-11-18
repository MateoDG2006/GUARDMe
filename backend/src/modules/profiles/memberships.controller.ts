import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import type { Principal } from '../identity/principal';
import { AccessService } from './access.service';

@Controller('profiles')
export class MembershipsController {
  constructor(private readonly access: AccessService) {}

  @Get(':id/memberships')
  list(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.access.listMembers(principal, id);
  }

  @Delete(':id/memberships/:accessId')
  @HttpCode(204)
  revoke(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('accessId', ParseUUIDPipe) accessId: string,
    @Query('confirmLast') confirmLast?: string,
  ): Promise<void> {
    return this.access.revokeAccess(principal, id, accessId, {
      confirmLast: confirmLast === 'true',
    });
  }
}
