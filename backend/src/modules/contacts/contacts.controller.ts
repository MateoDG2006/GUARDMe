import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import type { Principal } from '../identity/principal';
import { ContactsService } from './contacts.service';
import { CreateContactDto, UpdateContactsDto } from './dto/contact.dto';

@Controller('profiles')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get(':id/contacts')
  list(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contacts.list(principal, id);
  }

  @Post(':id/contacts')
  create(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: CreateContactDto,
  ) {
    return this.contacts.create(principal, id, input);
  }

  @Patch(':id/contacts')
  replace(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateContactsDto,
  ) {
    return this.contacts.replaceOrder(principal, id, input);
  }

  @Delete(':id/contacts/:contactId')
  remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Query('expectedContactsVersion', ParseIntPipe)
    expectedContactsVersion: number,
  ) {
    return this.contacts.remove(
      principal,
      id,
      contactId,
      expectedContactsVersion,
    );
  }
}
