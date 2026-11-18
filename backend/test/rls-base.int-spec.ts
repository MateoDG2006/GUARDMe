import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { DbService } from '../src/infra/db/db.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { PendingActionsService } from '../src/modules/pending-actions/pending-actions.service';
import { truncateGuardme } from './helpers/db-reset';
import { createEmailSession } from './helpers/auth-sessions';

function withPool(url: string, limit: number): string {
  const parsed = new URL(url);
  parsed.searchParams.set('connection_limit', String(limit));
  parsed.searchParams.set('pool_timeout', '20');
  return parsed.toString();
}

describe('RLS base', () => {
  let owner: PrismaClient;
  let api: PrismaClient;
  let db: DbService;

  beforeAll(() => {
    owner = new PrismaClient({
      datasourceUrl: process.env.DATABASE_URL_MIGRATIONS,
    });
    api = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_API });
    db = new DbService(api);
  });

  afterAll(async () => {
    await Promise.all([owner.$disconnect(), api.$disconnect()]);
  });

  beforeEach(async () => {
    await truncateGuardme(owner);
  });

  it('[T32] hides idempotency rows without context and across accounts', async () => {
    const accountA = randomUUID();
    const accountB = randomUUID();
    await owner.idempotencyKey.createMany({
      data: [
        {
          accountId: accountA,
          key: 'key-a',
          route: 'POST /v1/example',
          requestHash: 'hash-a',
          statusCode: 200,
          responseBody: { ok: true },
        },
        {
          accountId: accountB,
          key: 'key-b',
          route: 'POST /v1/example',
          requestHash: 'hash-b',
          statusCode: 200,
          responseBody: { ok: true },
        },
      ],
    });

    const bare = await api.$queryRaw<Array<{ key: string }>>`
      SELECT key FROM guardme.idempotency_keys
    `;
    expect(bare).toEqual([]);

    const visible = await db.asAccount(
      { accountId: accountA, authUserId: accountA, installationId: null },
      (tx) =>
        tx.idempotencyKey.findMany({ select: { key: true, accountId: true } }),
    );
    expect(visible).toEqual([{ key: 'key-a', accountId: accountA }]);
  });

  it('[T33] does not expose guardme through a public REST surface', async () => {
    const email = `t33-${randomUUID()}@guardme.test`;
    await createEmailSession(email, 'Test-user-password-1');
    // PostgREST / Kong apagados (solo contenedor db): sin Data API pública.
    const result = await fetch(
      'http://127.0.0.1:54321/rest/v1/pending_actions',
    )
      .then(async (response) => ({
        ok: response.ok,
        status: response.status,
        body: await response.text(),
      }))
      .catch((error: unknown) => ({
        ok: false,
        status: 0,
        body: error instanceof Error ? error.message : String(error),
      }));
    expect(result.ok).toBe(false);
    expect(result.body).not.toMatch(/pending_actions|guardme/i);
  });

  it('[T37] keeps roles, context functions and infra tables after migrations', async () => {
    const objects = await owner.$queryRaw<Array<{ name: string | null }>>`
      SELECT to_regclass('guardme.pending_actions')::text AS name
      UNION ALL
      SELECT to_regclass('guardme.idempotency_keys')::text
      UNION ALL
      SELECT to_regclass('guardme.audit_log')::text
      UNION ALL
      SELECT p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'guardme' AND p.proname = 'ctx_account_id'
    `;
    expect(objects.map((row) => row.name).sort()).toEqual([
      'ctx_account_id',
      'guardme.audit_log',
      'guardme.idempotency_keys',
      'guardme.pending_actions',
    ]);
  });

  it('[T38] keeps each transaction on its own account when the pool is reused', async () => {
    const pooled = new PrismaClient({
      datasourceUrl: withPool(process.env.DATABASE_URL_API ?? '', 2),
    });
    const pooledDb = new DbService(pooled);
    const accountA = randomUUID();
    const accountB = randomUUID();
    try {
      await Promise.all(
        Array.from({ length: 50 }, (_, index) => {
          const accountId = index % 2 === 0 ? accountA : accountB;
          return pooledDb.asAccount(
            { accountId, authUserId: accountId, installationId: null },
            async (tx) => {
              const rows = await tx.$queryRaw<Array<{ ctx: string | null }>>`
                SELECT guardme.ctx_account_id()::text AS ctx
              `;
              expect(rows[0]?.ctx).toBe(accountId);
            },
          );
        }),
      );
    } finally {
      await pooled.$disconnect();
    }
  });

  it('guardme_api is not a table owner and cannot bypass RLS', async () => {
    const roles = await owner.$queryRaw<
      Array<{ rolbypassrls: boolean; rolsuper: boolean; rolinherit: boolean }>
    >`
      SELECT rolbypassrls, rolsuper, rolinherit
      FROM pg_roles
      WHERE rolname = 'guardme_api'
    `;
    expect(roles).toEqual([
      { rolbypassrls: false, rolsuper: false, rolinherit: false },
    ]);

    const owned = await owner.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'guardme' AND tableowner = 'guardme_api'
    `;
    expect(owned).toEqual([]);
  });

  it('enqueue and audit inserts are not readable by the api role', async () => {
    const accountId = randomUUID();
    const resourceId = randomUUID();
    const pending = new PendingActionsService();
    const audit = new AuditService();

    await db.asAccount(
      { accountId, authUserId: accountId, installationId: null },
      async (tx) => {
        await pending.enqueue(tx, {
          type: 'NOTIFY_INCIDENT',
          resourceType: 'incident',
          resourceId,
          dedupeKey: `notify:incident:${resourceId}:fall`,
          runAt: new Date('2026-11-14T12:00:00.000Z'),
        });
        await pending.enqueue(tx, {
          type: 'NOTIFY_INCIDENT',
          resourceType: 'incident',
          resourceId,
          dedupeKey: `notify:incident:${resourceId}:fall`,
          runAt: new Date('2026-11-14T12:00:00.000Z'),
        });
        await audit.record(tx, {
          operation: 'bootstrap',
          result: 'ok',
          actorKind: 'account',
          actorAccountId: accountId,
          details: { phone: '+50712341234' },
        });
      },
    );

    await expect(api.pendingAction.findMany()).rejects.toThrow();
    await expect(api.auditLog.findMany()).rejects.toThrow();

    const stored = await owner.pendingAction.findMany();
    expect(stored).toHaveLength(1);
    const logged = await owner.auditLog.findMany();
    expect(logged).toHaveLength(1);
    expect(JSON.stringify(logged[0]?.details)).toContain('+507****1234');
    expect(JSON.stringify(logged[0]?.details)).not.toContain('+50712341234');
  });
});
