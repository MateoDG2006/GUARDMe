"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const pg_boss_1 = __importDefault(require("pg-boss"));
const queues_1 = require("../src/modules/pending-actions/queues");
async function main() {
    const connectionString = process.env.DATABASE_URL_MIGRATIONS;
    if (!connectionString)
        throw new Error('Falta DATABASE_URL_MIGRATIONS');
    const boss = new pg_boss_1.default({ connectionString, schema: 'pgboss' });
    await boss.start();
    for (const name of [
        ...queues_1.PENDING_ACTION_TYPES,
        ...queues_1.MAINTENANCE_TASKS.map((task) => task.name),
    ]) {
        await boss.createQueue(name);
    }
    await boss.stop();
    const db = new client_1.PrismaClient({ datasourceUrl: connectionString });
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
    }
    finally {
        await db.$disconnect();
    }
}
main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
});
//# sourceMappingURL=pgboss-install.js.map