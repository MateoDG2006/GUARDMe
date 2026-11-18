import { randomUUID } from 'crypto';
import { correlationStorage } from '../../common/correlation/correlation.middleware';
import type { Tx } from '../../infra/db/db.service';
import { AuditService } from './audit.service';

describe('AuditService.record', () => {
  it('masks phones and drops secrets before insert', async () => {
    const values: unknown[][] = [];
    const tx = {
      $executeRaw: (_sql: TemplateStringsArray, ...bound: unknown[]) => {
        values.push(bound);
        return Promise.resolve(0);
      },
    } as unknown as Tx;
    const correlationId = randomUUID();
    const service = new AuditService();

    await correlationStorage.run({ correlationId }, () =>
      service.record(tx, {
        operation: 'contact.priority',
        result: 'ok',
        actorKind: 'account',
        actorAccountId: randomUUID(),
        details: {
          phone: '+50712341234',
          secret: 'do-not-store',
          note: 'ok',
        },
      }),
    );

    const payload = values[0]?.map(String).join(' ');
    expect(payload).toContain('+507****1234');
    expect(payload).not.toContain('+50712341234');
    expect(payload).not.toContain('do-not-store');
    expect(payload).toContain(correlationId);
  });
});
