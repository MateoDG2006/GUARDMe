import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import type { Principal } from '../identity/principal';
import { ReportStepDto } from './dto/report-step.dto';
import { OnboardingProgressService } from './onboarding-progress.service';

@Controller('onboarding')
export class OnboardingProgressController {
  constructor(private readonly progress: OnboardingProgressService) {}

  @Get()
  get(
    @CurrentPrincipal() principal: Principal,
    @Query('profileId') profileId?: string,
  ) {
    return this.progress.get(
      principal,
      profileId && profileId.length > 0 ? profileId : null,
    );
  }

  @Post('steps')
  report(
    @CurrentPrincipal() principal: Principal,
    @Body() input: ReportStepDto,
  ) {
    return this.progress.report(principal, input);
  }
}
