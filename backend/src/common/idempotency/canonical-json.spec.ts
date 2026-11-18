import { requestHash } from './canonical-json';

describe('requestHash', () => {
  it('ignores object key order and keeps array order', () => {
    const left = requestHash({ b: 1, a: { d: 2, c: [1, 2] } });
    const right = requestHash({ a: { c: [1, 2], d: 2 }, b: 1 });
    expect(left).toBe(right);
    expect(requestHash({ items: [1, 2] })).not.toBe(
      requestHash({ items: [2, 1] }),
    );
  });
});
