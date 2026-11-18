import { Injectable } from '@nestjs/common';
import { ClockPort } from '../../infra/clock/clock.port';
import type { Tx } from '../../infra/db/db.service';
import { PendingActionsService } from '../pending-actions/pending-actions.service';

export type SyncKind = 'changes' | 'location_refresh';

@Injectable()
export class SyncSignalService {
  constructor(
    private readonly clock: ClockPort,
    private readonly pending: PendingActionsService,
  ) {}

  async requestSyncSignal(
    tx: Tx,
    profileId: string,
    kind: SyncKind,
  ): Promise<void> {
    const now = this.clock.now();
    const segment = Math.floor(now.getTime() / 1000 / 10);
    await this.pending.enqueue(tx, {
      type: 'SYNC_SIGNAL',
      resourceType: 'profile',
      resourceId: profileId,
      dedupeKey: `sync:${profileId}:${kind}:${segment}`,
      runAt: new Date(now.getTime() + 5_000),
      payload: { kind },
    });
  }
}
