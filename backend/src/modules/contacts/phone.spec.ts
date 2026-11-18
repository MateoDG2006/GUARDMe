import { maskPhone, normalizePhone } from './phone';

describe('phone', () => {
  it('normalizes a Panama local number and an international one', () => {
    expect(normalizePhone('6123-4567', 'PA')).toBe('+50761234567');
    expect(normalizePhone('+507 6123 4567', 'PA')).toBe('+50761234567');
  });

  it('rejects a number that is not a phone', () => {
    expect(normalizePhone('123', 'PA')).toBeNull();
  });

  it('masks the national portion', () => {
    expect(maskPhone('+50761231234')).toBe('+507****1234');
  });
});
