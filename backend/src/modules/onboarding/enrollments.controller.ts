import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AllowUnbootstrapped } from '../../common/decorators/allow-unbootstrapped.decorator';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Throttle } from '../../common/throttle/named-throttle';
import type { Principal } from '../identity/principal';
import { ConsumeEnrollmentDto, IssueEnrollmentDto } from './dto/enrollment.dto';
import { EnrollmentsService } from './enrollments.service';

@Controller()
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @Post('profiles/:id/enrollments')
  issue(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: IssueEnrollmentDto,
  ) {
    return this.enrollments.issue(principal, id, input);
  }

  @Delete('enrollments/:id')
  @HttpCode(204)
  withdraw(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.enrollments.withdraw(principal, id);
  }

  @Post('enrollments/consume')
  @AllowUnbootstrapped()
  @Throttle('secrets')
  async consume(
    @CurrentPrincipal() principal: Principal,
    @Body() input: ConsumeEnrollmentDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.enrollments.consume(principal, input);
    response.status(result.replay ? 200 : 201);
    return {
      account: result.account,
      access: result.access,
      installation: result.installation,
    };
  }
}
