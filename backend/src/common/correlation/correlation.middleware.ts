import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const correlationStorage = new AsyncLocalStorage<{
  correlationId: string;
}>();

export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore()?.correlationId;
}

export function resolveCorrelationId(header: unknown): string {
  const value: unknown = Array.isArray(header)
    ? (header as unknown[])[0]
    : header;
  if (typeof value === 'string' && UUID_RE.test(value)) return value;
  return randomUUID();
}

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const currentId = (req as Request & { id?: unknown }).id;
    const header = req.header('x-correlation-id');
    const correlationId =
      typeof header === 'string' && UUID_RE.test(header)
        ? header
        : typeof currentId === 'string' && UUID_RE.test(currentId)
          ? currentId
          : resolveCorrelationId(header);
    (req as Request & { id?: string }).id = correlationId;
    res.setHeader('X-Correlation-Id', correlationId);
    correlationStorage.run({ correlationId }, () => next());
  }
}
