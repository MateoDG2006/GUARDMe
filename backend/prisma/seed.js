"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const client_1 = require("@prisma/client");
async function main() {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('prisma/seed.ts no corre en producción');
    }
    const db = new client_1.PrismaClient({
        datasourceUrl: process.env.DATABASE_URL_MIGRATIONS,
    });
    try {
        await db.$executeRawUnsafe(`ALTER ROLE guardme_api LOGIN PASSWORD 'guardme_api_dev'`);
        await db.$executeRawUnsafe(`ALTER ROLE guardme_onboarding LOGIN PASSWORD 'guardme_onboarding_dev'`);
        await db.$executeRawUnsafe(`ALTER ROLE guardme_worker LOGIN PASSWORD 'guardme_worker_dev'`);
        await db.$executeRawUnsafe(`ALTER ROLE guardme_ingest LOGIN PASSWORD 'guardme_ingest_dev'`);
        await db.$executeRawUnsafe(`ALTER ROLE guardme_auth LOGIN PASSWORD 'guardme_auth_dev'`);
    }
    finally {
        await db.$disconnect();
    }
    (0, child_process_1.execFileSync)(process.execPath, ['--env-file=.env', '--import', 'tsx', 'scripts/pgboss-install.ts'], { stdio: 'inherit', cwd: process.cwd() });
    (0, child_process_1.execFileSync)(process.execPath, [
        '--env-file=.env',
        '-r',
        'ts-node/register/transpile-only',
        'scripts/seed-demo-users.ts',
    ], { stdio: 'inherit', cwd: process.cwd() });
}
main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
});
//# sourceMappingURL=seed.js.map