import type { PendingActionType } from './pending-actions.service';

export interface PendingActionRow {
  id: string;
  type: PendingActionType;
  resourceType: string;
  resourceId: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  runAt: Date;
}

export type HandlerResult =
  | { outcome: 'done' }
  | { outcome: 'discarded'; reason: string }
  | { outcome: 'retry'; error: string; retryInSec?: number }
  | { outcome: 'failed'; error: string };

export interface ActionHandler {
  readonly types: readonly PendingActionType[];
  handle(action: PendingActionRow): Promise<HandlerResult>;
}

export const ACTION_HANDLERS = Symbol('ACTION_HANDLERS');

export const CALL_QUEUES = new Set<PendingActionType>([
  'START_NEXT_CALL_ATTEMPT',
  'RECONCILE_CALL_ATTEMPT',
  'CANCEL_ACTIVE_CALL',
  'HUMAN_CONFIRM_TIMEOUT',
  'CALL_RING_TIMEOUT',
  'APPLY_PROVIDER_EVENT',
]);

export function retryDelaySec(attempts: number, retryInSec?: number): number {
  if (retryInSec != null) return retryInSec;
  return Math.min(5 * 2 ** attempts, 300);
}

export function terminalFailure(
  result: HandlerResult,
  attempts: number,
  maxAttempts: number,
): HandlerResult {
  if (result.outcome !== 'retry') return result;
  if (attempts < maxAttempts) return result;
  return { outcome: 'failed', error: result.error };
}
