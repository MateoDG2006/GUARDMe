import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL_MIGRATIONS,
});

async function main() {
  const users = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    'SELECT count(*)::int AS n FROM identity.users',
  );
  const access = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM guardme.profile_access WHERE status = 'active'`,
  );
  const contacts = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM guardme.contacts WHERE status = 'active'`,
  );
  const reminders = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM guardme.reminders WHERE status = 'active'`,
  );
  const cane = await prisma.$queryRawUnsafe<
    Array<{ serial: string; status: string }>
  >(`SELECT serial, status FROM guardme.canes WHERE serial = 'GM-DEMO-001'`);
  console.log({
    users: users[0]?.n,
    access: access[0]?.n,
    contacts: contacts[0]?.n,
    reminders: reminders[0]?.n,
    cane,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
