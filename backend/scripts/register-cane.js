"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const secret_codes_1 = require("../src/common/secrets/secret-codes");
function isDuplicateSerial(error) {
    if (!error || typeof error !== 'object')
        return false;
    const record = error;
    const codes = [record.code, record.meta?.code].map((value) => String(value));
    return (codes.includes('23505') ||
        codes.includes('P2002') ||
        (typeof record.message === 'string' && record.message.includes('23505')));
}
function arg(name) {
    const index = process.argv.indexOf(name);
    const value = index === -1 ? undefined : process.argv[index + 1];
    if (!value || value.startsWith('--')) {
        throw new Error(`Falta ${name}`);
    }
    return value;
}
function optionalArg(name) {
    const index = process.argv.indexOf(name);
    const value = index === -1 ? undefined : process.argv[index + 1];
    if (!value || value.startsWith('--'))
        return undefined;
    return value;
}
async function main() {
    const serial = arg('--serial');
    const model = arg('--model');
    const code = optionalArg('--code') ?? (0, secret_codes_1.newEnrollmentCode)();
    const db = new client_1.PrismaClient({
        datasourceUrl: process.env.DATABASE_URL_MIGRATIONS,
    });
    try {
        await db.$executeRaw `
      INSERT INTO guardme.canes (serial, model, claim_secret_hash)
      VALUES (${serial}, ${model}, ${(0, secret_codes_1.hashSecret)((0, secret_codes_1.normalizeEnrollmentCode)(code))})
    `;
        process.stdout.write(`${code}\n`);
    }
    catch (error) {
        if (isDuplicateSerial(error)) {
            process.stderr.write('La serie ya existe\n');
            process.exitCode = 1;
            return;
        }
        throw error;
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
//# sourceMappingURL=register-cane.js.map