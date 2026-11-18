import { PrismaClient } from '@prisma/client';
import PgBoss from 'pg-boss';
import {
  MAINTENANCE_TASKS,
  PENDING_ACTION_TYPES,
} from '../src/modules/pending-actions/queues';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL_MIGRATIONS;
  if (!connectionString) throw new Error('Falta DATABASE_URL_MIGRATIONS');
  const boss = new PgBoss({ connectionString, schema: 'pgboss' });
  await boss.start();
  for (const name of [
    ...PENDING_ACTION_TYPES,
    ...MAINTENANCE_TASKS.map((task) => task.name),
  ]) {
    await boss.createQueue(name);
  }
  await boss.stop();
  const db = new PrismaClient({ datasourceUrl: connectionString });
  try {
    const grants = [
      'GRANT USAGE ON SCHEMA pgboss TO guardme_worker',
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO guardme_worker',
      'GRANT USAGE ON ALL SEQUENCES IN SCHEMA pgboss TO guardme_worker',
      'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO guardme_worker',
    ];
    for (const statement of grants) {
      await db.$executeRawUnsafe(statement);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
