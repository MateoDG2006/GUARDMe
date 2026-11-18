import {
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';

export function normalizePhone(
  raw: string,
  region: CountryCode,
): string | null {
  const parsed = parsePhoneNumberFromString(raw, region);
  if (!parsed?.isValid()) return null;
  return parsed.number;
}

export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.length < 8) return '****';
  return `+${digits.slice(0, 3)}****${digits.slice(-4)}`;
}
