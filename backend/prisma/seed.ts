/**
 * Seed local: contraseñas de roles, pg-boss y datos demo.
 * No corre en producción.
 */
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('prisma/seed.ts no corre en producción');
  }

  const db = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL_MIGRATIONS,
  });
  try {
    await db.$executeRawUnsafe(
      `ALTER ROLE guardme_api LOGIN PASSWORD 'guardme_api_dev'`,
    );
    await db.$executeRawUnsafe(
      `ALTER ROLE guardme_onboarding LOGIN PASSWORD 'guardme_onboarding_dev'`,
    );
    await db.$executeRawUnsafe(
      `ALTER ROLE guardme_worker LOGIN PASSWORD 'guardme_worker_dev'`,
    );
    await db.$executeRawUnsafe(
      `ALTER ROLE guardme_ingest LOGIN PASSWORD 'guardme_ingest_dev'`,
    );
    await db.$executeRawUnsafe(
      `ALTER ROLE guardme_auth LOGIN PASSWORD 'guardme_auth_dev'`,
    );
  } finally {
    await db.$disconnect();
  }

  const envFile = existsSync('.env') ? ['--env-file=.env'] : [];

  execFileSync(
    process.execPath,
    [...envFile, '--import', 'tsx', 'scripts/pgboss-install.ts'],
    { stdio: 'inherit', cwd: process.cwd(), env: process.env },
  );

  // ts-node (no tsx): Nest necesita emitDecoratorMetadata para DI.
  execFileSync(
    process.execPath,
    [
      ...envFile,
      '-r',
      'ts-node/register/transpile-only',
      'scripts/seed-demo-users.ts',
    ],
    { stdio: 'inherit', cwd: process.cwd(), env: process.env },
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
