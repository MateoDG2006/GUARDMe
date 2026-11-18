import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AllowUnbootstrapped } from '../../common/decorators/allow-unbootstrapped.decorator';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { BootstrapAccountDto } from './dto/bootstrap-account.dto';
import { AccountsService } from './accounts.service';
import type { Principal } from './principal';

@Controller()
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post('accounts/bootstrap')
  @AllowUnbootstrapped()
  async bootstrap(
    @CurrentPrincipal() principal: Principal,
    @Body() input: BootstrapAccountDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.accounts.bootstrap(principal, input);
    response.status(result.created ? 201 : 200);
    return result;
  }

  @Get('me')
  me(@CurrentPrincipal() principal: Principal) {
    return this.accounts.getMe(principal);
  }
}
