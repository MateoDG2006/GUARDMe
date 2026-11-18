import { Injectable, Logger } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { ClockPort } from '../../infra/clock/clock.port';
import { DbService } from '../../infra/db/db.service';
import { TelephonyPort } from '../../infra/telephony/telephony.port';
import { PendingActionsService } from '../pending-actions/pending-actions.service';

@Injectable()
export class ProviderEventsService {
  private readonly logger = new Logger(ProviderEventsService.name);

  constructor(
    private readonly db: DbService,
    private readonly clock: ClockPort,
    private readonly telephony: TelephonyPort,
    private readonly pending: PendingActionsService,
  ) {}

  async ingest(
    provider: string,
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
  ): Promise<void> {
    if (provider !== this.telephony.provider)
      throw new DomainError('NOT_FOUND');
    let events;
    try {
      events = this.telephony.verifyAndParseWebhook(flatten(headers), rawBody);
    } catch (error) {
      if (error instanceof DomainError && error.code === 'UNAUTHENTICATED') {
        this.logger.warn({ code: 'UNAUTHENTICATED' });
      }
      throw error;
    }
    const now = this.clock.now();
    await this.db.asIngest(async (tx) => {
      for (const event of events) {
        const rows = await tx.$queryRaw<Array<{ id: string | null }>>`
          SELECT guardme.record_provider_event(
            ${provider},
            ${event.eventKey},
            ${event.providerRef},
            ${event.status},
            ${event.sequence}::int,
            ${event.providerTimestamp}::timestamptz
          ) AS id
        `;
        const id = rows[0]?.id;
        if (!id) continue;
        await this.pending.enqueue(tx, {
          type: 'APPLY_PROVIDER_EVENT',
          resourceType: 'provider_event',
          resourceId: id,
          dedupeKey: `provider:${provider}:${event.eventKey}`,
          runAt: now,
        });
      }
    });
  }
}

function flatten(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') result[key.toLowerCase()] = value;
    else if (Array.isArray(value) && value[0])
      result[key.toLowerCase()] = value[0];
  }
  return result;
}
