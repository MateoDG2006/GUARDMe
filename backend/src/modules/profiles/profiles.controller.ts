import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Idempotent } from '../../common/idempotency/idempotent.decorator';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import type { Principal } from '../identity/principal';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfilesService } from './profiles.service';

@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Post()
  @Idempotent()
  create(
    @CurrentPrincipal() principal: Principal,
    @Body() input: CreateProfileDto,
  ) {
    return this.profiles.create(principal, input);
  }

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.profiles.list(principal);
  }

  @Get(':id')
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.profiles.get(principal, id);
  }

  @Patch(':id')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateProfileDto,
  ) {
    return this.profiles.update(principal, id, input);
  }
}
