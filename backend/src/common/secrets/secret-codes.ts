import { createHmac, randomBytes } from 'crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function newInvitationSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function newEnrollmentCode(): string {
  const bytes = randomBytes(10);
  let raw = '';
  for (const byte of bytes) {
    raw += CROCKFORD[byte % CROCKFORD.length];
  }
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export function normalizeEnrollmentCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

export function hashSecret(value: string): string {
  const pepper = process.env.SECRET_PEPPER;
  if (!pepper) throw new Error('Falta SECRET_PEPPER');
  return createHmac('sha256', pepper).update(value).digest('hex');
}
