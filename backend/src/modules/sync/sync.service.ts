import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { DbService, type Tx } from '../../infra/db/db.service';
import { toAccountContext, type Principal } from '../identity/principal';

export interface ChangeItem {
  profileId: string;
  resourceType: string;
  resourceId: string;
  op: 'upsert' | 'delete';
  version: number | null;
}

export interface ChangesPage {
  changes: ChangeItem[];
  accessibleProfileIds: string[];
  nextCursor: string;
  hasMore: boolean;
  resetRequired: boolean;
}

interface Cursor {
  x: string;
  s: string;
}

@Injectable()
export class SyncService {
  constructor(private readonly db: DbService) {}

  getChanges(
    principal: Principal,
    query: { cursor?: string; limit?: number },
  ): Promise<ChangesPage> {
    const limit = query.limit ?? 200;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new DomainError('VALIDATION_FAILED', 'Validación fallida', {
        fields: [{ field: 'limit', messages: ['Entre 1 y 500'] }],
      });
    }
    const cursor = decodeCursor(query.cursor);
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const profiles = await tx.$queryRaw<Array<{ profile_id: string }>>`
        SELECT profile_id
        FROM guardme.profile_access
        WHERE status = 'active'
          AND account_id = guardme.ctx_account_id()
        ORDER BY profile_id
      `;
      const accessibleProfileIds = profiles.map((row) => row.profile_id);
      if (!cursor) {
        const position = await this.position(tx);
        return {
          changes: [],
          accessibleProfileIds,
          nextCursor: encodeCursor(position),
          hasMore: false,
          resetRequired: true,
        };
      }
      const rows = await tx.$queryRaw<
        Array<{
          seq: bigint;
          txid: string;
          profile_id: string;
          resource_type: string;
          resource_id: string;
          op: 'upsert' | 'delete';
          version: number | null;
        }>
      >`
        SELECT seq, txid::text AS txid, profile_id, resource_type, resource_id, op, version
        FROM guardme.change_log
        WHERE (txid, seq) > (${cursor.x}::xid8, ${cursor.s}::bigint)
          AND txid < pg_snapshot_xmin(pg_current_snapshot())
        ORDER BY txid, seq
        LIMIT ${limit + 1}::int
      `;
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const next = last
        ? { x: last.txid, s: last.seq.toString() }
        : await this.position(tx);
      return {
        changes: page.map((row) => ({
          profileId: row.profile_id,
          resourceType: row.resource_type,
          resourceId: row.resource_id,
          op: row.op,
          version: row.version,
        })),
        accessibleProfileIds,
        nextCursor: encodeCursor(next),
        hasMore: rows.length > limit,
        resetRequired: false,
      };
    });
  }

  private async position(tx: Tx): Promise<Cursor> {
    const rows = await tx.$queryRaw<Array<{ x: string; s: bigint }>>`
      SELECT
        pg_snapshot_xmin(pg_current_snapshot())::text AS x,
        COALESCE(
          (
            SELECT max(seq)
            FROM guardme.change_log
            WHERE txid < pg_snapshot_xmin(pg_current_snapshot())
          ),
          0
        ) AS s
    `;
    return { x: rows[0]?.x ?? '0', s: (rows[0]?.s ?? 0n).toString() };
  }
}

function decodeCursor(value?: string): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as { x?: unknown; s?: unknown };
    if (typeof parsed.x !== 'string' || typeof parsed.s !== 'string')
      return null;
    if (!/^\d+$/.test(parsed.x) || !/^\d+$/.test(parsed.s)) return null;
    return { x: parsed.x, s: parsed.s };
  } catch {
    return null;
  }
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}
