import { Injectable } from '@nestjs/common';
import { getCorrelationId } from '../../common/correlation/correlation.middleware';
import type { Tx } from '../../infra/db/db.service';

const DROPPED_KEYS = new Set([
  'secret',
  'pin',
  'token',
  'push_token',
  'authorization',
  'lat',
  'lng',
  'code',
]);

export interface AuditEntry {
  operation: string;
  result: 'ok' | 'denied' | 'failed';
  profileId?: string;
  actorAccountId?: string | null;
  actorKind: 'account' | 'installation' | 'system' | 'provider';
  details?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  async record(tx: Tx, entry: AuditEntry): Promise<void> {
    const correlationId = getCorrelationId() ?? null;
    const details = redactDetails(entry.details ?? {});
    await tx.$executeRaw`
      INSERT INTO guardme.audit_log (
        actor_account_id,
        actor_kind,
        profile_id,
        operation,
        result,
        correlation_id,
        details
      )
      VALUES (
        ${entry.actorAccountId ?? null}::uuid,
        ${entry.actorKind},
        ${entry.profileId ?? null}::uuid,
        ${entry.operation},
        ${entry.result},
        ${correlationId}::uuid,
        ${JSON.stringify(details)}::jsonb
      )
    `;
  }
}

function redactDetails(value: unknown, key?: string): unknown {
  if (key) {
    const lower = key.toLowerCase();
    if (
      DROPPED_KEYS.has(lower) ||
      lower.includes('secret') ||
      lower.includes('token')
    ) {
      return undefined;
    }
    if (lower.includes('phone') && typeof value === 'string') {
      return maskPhone(value);
    }
  }
  if (Array.isArray(value)) return value.map((item) => redactDetails(item));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const next = redactDetails(childValue, childKey);
      if (next !== undefined) out[childKey] = next;
    }
    return out;
  }
  return value;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return '****';
  const prefix = phone.trim().startsWith('+')
    ? `+${digits.slice(0, 3)}`
    : digits.slice(0, 3);
  return `${prefix}****${digits.slice(-4)}`;
}
