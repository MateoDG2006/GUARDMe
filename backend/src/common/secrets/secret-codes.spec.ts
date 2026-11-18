import {
  hashSecret,
  newEnrollmentCode,
  newInvitationSecret,
  normalizeEnrollmentCode,
} from './secret-codes';

describe('secret codes', () => {
  beforeAll(() => {
    process.env.SECRET_PEPPER = 'replace-with-32-byte-random-secret-value';
  });

  it('formats an invitation secret and an enrollment code', () => {
    expect(newInvitationSecret()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newEnrollmentCode()).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/,
    );
  });

  it('normalizes confusing characters before the HMAC', () => {
    expect(normalizeEnrollmentCode('abcil-oo 1l')).toBe('ABC110011');
    expect(hashSecret('ABC1100111')).toBe(hashSecret('ABC1100111'));
    expect(hashSecret('ABC1100111')).not.toBe(hashSecret('ABC1100112'));
  });
});
