import { DomainError } from '../errors/domain-error';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CursorPoint {
  at: string;
  id: string;
}

export function encodeCursor(point: CursorPoint): string {
  return Buffer.from(JSON.stringify(point), 'utf8').toString('base64url');
}

export function decodeCursor(value: string): CursorPoint {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }
  if (!isRecord(parsed)) throw invalid();
  const at = parsed.at;
  const id = parsed.id;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) throw invalid();
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw invalid();
  return { at: new Date(at).toISOString(), id };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function invalid(): DomainError {
  return new DomainError('VALIDATION_FAILED', 'Validación fallida', {
    fields: [{ field: 'cursor', messages: ['Cursor inválido'] }],
  });
}
