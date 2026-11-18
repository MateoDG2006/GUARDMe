import { retryDelaySec, terminalFailure } from './action-handler';

describe('retryDelaySec', () => {
  it('backs off until the cap and honors an explicit delay', () => {
    expect(retryDelaySec(1)).toBe(10);
    expect(retryDelaySec(8)).toBe(300);
    expect(retryDelaySec(8, 3)).toBe(3);
  });
});

describe('terminalFailure', () => {
  it('fails the retry once attempts reach the maximum', () => {
    const retry = { outcome: 'retry' as const, error: 'unavailable' };
    expect(terminalFailure(retry, 4, 5)).toEqual(retry);
    expect(terminalFailure(retry, 5, 5)).toEqual({
      outcome: 'failed',
      error: 'unavailable',
    });
    expect(terminalFailure({ outcome: 'done' }, 5, 5)).toEqual({
      outcome: 'done',
    });
  });
});
