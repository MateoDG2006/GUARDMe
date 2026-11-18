import {
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { ProviderEventsService } from './provider-events.service';

@Controller()
export class ProviderEventsController {
  constructor(private readonly events: ProviderEventsService) {}

  @Post('provider-events/:provider')
  @Public()
  @HttpCode(204)
  receive(
    @Param('provider') provider: string,
    @Req() request: RawBodyRequest<Request>,
  ): Promise<void> {
    return this.events.ingest(
      provider,
      request.headers,
      request.rawBody ?? Buffer.from(''),
    );
  }
}
