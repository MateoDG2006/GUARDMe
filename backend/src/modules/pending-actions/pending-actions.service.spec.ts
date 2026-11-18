import { randomUUID } from 'crypto';
import { correlationStorage } from '../../common/correlation/correlation.middleware';
import type { Tx } from '../../infra/db/db.service';
import { PendingActionsService } from './pending-actions.service';

describe('PendingActionsService.enqueue', () => {
  it('inserts with ON CONFLICT DO NOTHING and the correlation id', async () => {
    let sql = '';
    const values: unknown[] = [];
    const tx = {
      $executeRaw: (chunks: TemplateStringsArray, ...bound: unknown[]) => {
        sql = chunks.join(' ');
        values.push(...bound);
        return Promise.resolve(0);
      },
    } as unknown as Tx;
    const correlationId = randomUUID();

    await correlationStorage.run({ correlationId }, () =>
      new PendingActionsService().enqueue(tx, {
        type: 'NOTIFY_INCIDENT',
        resourceType: 'incident',
        resourceId: randomUUID(),
        dedupeKey: 'notify:incident:1:fall',
        runAt: new Date('2026-11-14T00:00:00.000Z'),
      }),
    );

    expect(sql).toContain('guardme.enqueue_pending_action');
    expect(sql).not.toContain('RETURNING');
    expect(values.map(String).join(' ')).toContain(correlationId);
  });
});
