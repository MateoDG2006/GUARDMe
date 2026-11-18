import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { DomainError } from '../../common/errors/domain-error';
import { DbService } from '../../infra/db/db.service';
import { FakeTelephonyAdapter } from '../../infra/telephony/fake-telephony.adapter';
import {
  PROVIDER_CALL_STATUSES,
  TelephonyPort,
  type ProviderCallStatus,
} from '../../infra/telephony/telephony.port';
import type { Principal } from '../identity/principal';
import { toAccountContext } from '../identity/principal';
import { AccessService } from '../profiles/access.service';

class FakeTelephonyEventDto {
  @IsIn(PROVIDER_CALL_STATUSES)
  status: ProviderCallStatus;
}

@Controller()
export class DevTelephonyController {
  constructor(
    private readonly db: DbService,
    private readonly telephony: TelephonyPort,
    private readonly access: AccessService,
  ) {}

  @Post('dev/fake-telephony/attempts/:attemptId/events')
  async emit(
    @CurrentPrincipal() principal: Principal,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() input: FakeTelephonyEventDto,
  ): Promise<void> {
    if (!(this.telephony instanceof FakeTelephonyAdapter)) {
      throw new DomainError('CAPABILITY_NOT_ENABLED');
    }
    const attempt = await this.db.asAccount(
      toAccountContext(principal),
      async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{ provider_ref: string | null; profile_id: string }>
        >`
        SELECT a.provider_ref, i.profile_id
        FROM guardme.call_attempts a
        JOIN guardme.incidents i ON i.id = a.incident_id
        WHERE a.id = ${attemptId}::uuid
      `;
        const row = rows[0];
        if (!row) throw new DomainError('NOT_FOUND');
        await this.access.requireAccess(tx, row.profile_id);
        return row;
      },
    );
    if (!attempt.provider_ref) throw new DomainError('INCOMPATIBLE_STATE');
    await this.telephony.emit(attempt.provider_ref, input.status);
  }
}
