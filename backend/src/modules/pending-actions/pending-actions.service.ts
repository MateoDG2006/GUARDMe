import { Injectable } from '@nestjs/common';
import { getCorrelationId } from '../../common/correlation/correlation.middleware';
import type { Tx } from '../../infra/db/db.service';
import { type PendingActionType } from './queues';

export type { PendingActionType } from './queues';

export interface EnqueueInput {
  type: PendingActionType;
  resourceType: string;
  resourceId: string;
  dedupeKey: string;
  runAt: Date;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
}

@Injectable()
export class PendingActionsService {
  async enqueue(tx: Tx, input: EnqueueInput): Promise<void> {
    const correlationId = getCorrelationId();
    const payload = {
      ...(input.payload ?? {}),
      ...(correlationId ? { correlationId } : {}),
    };
    await tx.$executeRaw`
      SELECT guardme.enqueue_pending_action(
        ${input.type},
        ${input.resourceType},
        ${input.resourceId}::uuid,
        ${input.dedupeKey},
        ${JSON.stringify(payload)}::jsonb,
        ${input.runAt}::timestamptz,
        ${input.maxAttempts ?? 5}::int
      )
    `;
  }
}
