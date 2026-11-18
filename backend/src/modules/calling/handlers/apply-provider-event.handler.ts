import { Injectable } from '@nestjs/common';
import { DbService } from '../../../infra/db/db.service';
import type { ProviderCallStatus } from '../../../infra/telephony/telephony.port';
import {
  type ActionHandler,
  type HandlerResult,
  type PendingActionRow,
} from '../../pending-actions/action-handler';
import { ProviderEventApplierService } from '../provider-event-applier.service';

@Injectable()
export class ApplyProviderEventHandler implements ActionHandler {
  readonly types = ['APPLY_PROVIDER_EVENT'] as const;

  constructor(
    private readonly db: DbService,
    private readonly applier: ProviderEventApplierService,
  ) {}

  async handle(action: PendingActionRow): Promise<HandlerResult> {
    const result = await this.db.asWorker(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string; provider_ref: string; status: ProviderCallStatus }>
      >`
        SELECT id, provider_ref, status
        FROM guardme.provider_events
        WHERE id = ${action.resourceId}::uuid
      `;
      const event = rows[0];
      if (!event) return 'unmatched' as const;
      return this.applier.apply(tx, {
        id: event.id,
        providerRef: event.provider_ref,
        status: event.status,
      });
    });
    if (result === 'unmatched') {
      return { outcome: 'retry', error: 'unmatched' };
    }
    return { outcome: 'done' };
  }
}
