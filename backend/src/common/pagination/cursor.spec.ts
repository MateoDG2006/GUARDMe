import { DomainError } from '../errors/domain-error';
import { decodeCursor, encodeCursor } from './cursor';

describe('cursor', () => {
  it('round-trips a timestamp and an id', () => {
    const point = {
      at: '2026-11-14T12:00:00.000Z',
      id: '11111111-1111-4111-8111-111111111111',
    };
    expect(decodeCursor(encodeCursor(point))).toEqual(point);
  });

  it('rejects a cursor that is not a point', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow(DomainError);
  });
});
