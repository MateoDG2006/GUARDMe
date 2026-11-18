import { resolveCorrelationId } from './correlation.middleware';

describe('resolveCorrelationId', () => {
  it('keeps a valid UUID and replaces anything else', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(resolveCorrelationId(id)).toBe(id);
    expect(resolveCorrelationId([id])).toBe(id);
    expect(resolveCorrelationId('not-a-uuid')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
