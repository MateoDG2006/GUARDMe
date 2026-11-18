import { Controller, Get, Headers, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  live(): { status: string } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(
    @Headers('x-health-token') token: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.health.ready(token);
    res.status(result.statusCode).json(result.body);
  }
}
