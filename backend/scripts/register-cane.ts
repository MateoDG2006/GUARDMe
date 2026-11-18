import { PrismaClient } from '@prisma/client';
import {
  hashSecret,
  newEnrollmentCode,
  normalizeEnrollmentCode,
} from '../src/common/secrets/secret-codes';

function isDuplicateSerial(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as {
    code?: unknown;
    message?: unknown;
    meta?: { code?: unknown };
  };
  const codes = [record.code, record.meta?.code].map((value) => String(value));
  return (
    codes.includes('23505') ||
    codes.includes('P2002') ||
    (typeof record.message === 'string' && record.message.includes('23505'))
  );
}

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Falta ${name}`);
  }
  return value;
}

function optionalArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith('--')) return undefined;
  return value;
}

async function main(): Promise<void> {
  const serial = arg('--serial');
  const model = arg('--model');
  const code = optionalArg('--code') ?? newEnrollmentCode();
  const db = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL_MIGRATIONS,
  });
  try {
    await db.$executeRaw`
      INSERT INTO guardme.canes (serial, model, claim_secret_hash)
      VALUES (${serial}, ${model}, ${hashSecret(normalizeEnrollmentCode(code))})
    `;
    process.stdout.write(`${code}\n`);
  } catch (error) {
    if (isDuplicateSerial(error)) {
      process.stderr.write('La serie ya existe\n');
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
