import { Controller, Get, Query } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import type { Principal } from '../identity/principal';
import { SyncService } from './sync.service';

class ChangesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

@Controller()
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('changes')
  changes(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ChangesQueryDto,
  ) {
    return this.sync.getChanges(principal, query);
  }
}
