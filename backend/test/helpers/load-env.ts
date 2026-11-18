import { readFileSync } from 'fs';
import { resolve } from 'path';

const file = resolve(__dirname, '../../.env');
let text: string;
try {
  text = readFileSync(file, 'utf8');
} catch {
  throw new Error(
    `Falta ${file}. Copia .env.example y completa los secretos locales.`,
  );
}

for (const line of text.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (process.env[key] === undefined) process.env[key] = value;
}
