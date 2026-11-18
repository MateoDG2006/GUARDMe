"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const app_module_1 = require("../src/app.module");
const configure_app_1 = require("../src/configure-app");
const better_auth_1 = require("../src/modules/identity/better-auth");
const child_process_1 = require("child_process");
const DEMO = {
    rosa: {
        email: 'rosa@guardme.local',
        password: 'GuardMe!rosa',
        name: 'Rosa Del Giudice',
        onboardingKind: 'self',
    },
    ana: {
        email: 'ana@guardme.local',
        password: 'GuardMe!ana',
        name: 'Ana',
        onboardingKind: 'caregiver',
    },
    perez: {
        email: 'perez@guardme.local',
        password: 'GuardMe!perez',
        name: 'Dr. Pérez',
        onboardingKind: 'caregiver',
    },
};
function today() {
    return new Date().toISOString().slice(0, 10);
}
function authConfig() {
    return {
        getOrThrow: (key) => {
            const value = process.env[key];
            if (!value)
                throw new Error(`Falta ${key}`);
            return value;
        },
    };
}
async function signUp(email, password, name) {
    const auth = await (0, better_auth_1.createAuth)(authConfig());
    try {
        const result = (await auth.api.signUpEmail({
            body: { email, password, name },
        }));
        const token = result.token ?? result.session?.token;
        const userId = result.user?.id;
        if (!token || !userId)
            throw new Error(`Sin sesión para ${email}`);
        return { token, userId };
    }
    finally {
        await auth.$disconnect();
    }
}
async function api(baseUrl, token, method, path, body, headers = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
            authorization: `Bearer ${token}`,
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
            ...(method !== 'GET' && method !== 'DELETE'
                ? { 'idempotency-key': (0, crypto_1.randomUUID)() }
                : {}),
            ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : null;
    return { status: response.status, json };
}
async function main() {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('seed-demo-users no corre en producción');
    }
    const owner = new client_1.PrismaClient({
        datasourceUrl: process.env.DATABASE_URL_MIGRATIONS,
    });
    try {
        const existing = await owner.$queryRaw `
      SELECT count(*)::int AS n
      FROM identity.users
      WHERE email = 'rosa@guardme.local'
    `;
        if ((existing[0]?.n ?? 0) > 0) {
            process.stdout.write('Demo ya sembrado; nada que hacer.\n');
            return;
        }
    }
    finally {
        await owner.$disconnect();
    }
    const rosa = await signUp(DEMO.rosa.email, DEMO.rosa.password, DEMO.rosa.name);
    const ana = await signUp(DEMO.ana.email, DEMO.ana.password, DEMO.ana.name);
    const perez = await signUp(DEMO.perez.email, DEMO.perez.password, DEMO.perez.name);
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: ['error', 'warn'],
        rawBody: true,
    });
    await (0, better_auth_1.mountAuth)(app);
    (0, configure_app_1.configureApp)(app);
    await app.listen(0);
    const baseUrl = await app.getUrl();
    try {
        for (const [session, kind, displayName] of [
            [rosa, DEMO.rosa.onboardingKind, DEMO.rosa.name],
            [ana, DEMO.ana.onboardingKind, DEMO.ana.name],
            [perez, DEMO.perez.onboardingKind, DEMO.perez.name],
        ]) {
            const boot = await api(baseUrl, session.token, 'POST', '/v1/accounts/bootstrap', {
                onboardingKind: kind,
                displayName,
            });
            if (boot.status !== 201 && boot.status !== 200) {
                throw new Error(`bootstrap ${displayName}: ${boot.status} ${JSON.stringify(boot.json)}`);
            }
            const bootBody = boot.json;
            session.accountId = bootBody.account?.id ?? bootBody.id;
            if (!session.accountId) {
                throw new Error(`bootstrap sin accountId: ${JSON.stringify(boot.json)}`);
            }
        }
        const profileRes = await api(baseUrl, rosa.token, 'POST', '/v1/profiles', {
            displayName: DEMO.rosa.name,
            timeZone: 'America/Panama',
            relation: 'user',
        });
        if (profileRes.status !== 201) {
            throw new Error(`perfil: ${profileRes.status} ${JSON.stringify(profileRes.json)}`);
        }
        const profileId = profileRes.json.id;
        const installRes = await api(baseUrl, rosa.token, 'POST', '/v1/installations', {
            clientInstallationId: (0, crypto_1.randomUUID)(),
            platform: 'android',
            appVersion: '0.0.1-demo',
        });
        if (installRes.status !== 201) {
            throw new Error(`installation: ${installRes.status}`);
        }
        const installationId = installRes.json.id;
        const contacts = [
            {
                displayName: 'Ana',
                phone: '+50761000101',
                priority: 1,
            },
            {
                displayName: 'Luis',
                phone: '+50761000102',
                priority: 2,
            },
            { displayName: 'Dr. Pérez', phone: '+50761000103' },
            { displayName: 'Marta', phone: '+50761000104' },
            { displayName: 'Carmen', phone: '+50761000105' },
        ];
        let contactsVersion = 1;
        for (const contact of contacts) {
            const created = await api(baseUrl, rosa.token, 'POST', `/v1/profiles/${profileId}/contacts`, { ...contact, expectedContactsVersion: contactsVersion }, { 'x-installation-id': installationId });
            if (created.status !== 201) {
                throw new Error(`contacto ${contact.displayName}: ${created.status} ${JSON.stringify(created.json)}`);
            }
            contactsVersion = created.json
                .contactsVersion;
        }
        const validFrom = today();
        const reminders = [
            {
                kind: 'medication',
                title: 'Losartán 50 mg',
                notes: '1 tableta con agua',
                schedules: [
                    {
                        localTime: '08:00',
                        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
                        timeZone: 'America/Panama',
                        validFrom,
                    },
                ],
            },
            {
                kind: 'medication',
                title: 'Losartán 50 mg',
                notes: '1 tableta con agua',
                schedules: [
                    {
                        localTime: '20:00',
                        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
                        timeZone: 'America/Panama',
                        validFrom,
                    },
                ],
            },
            {
                kind: 'medication',
                title: 'Metformina 850 mg',
                notes: '1 tableta con comida',
                schedules: [
                    {
                        localTime: '13:00',
                        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
                        timeZone: 'America/Panama',
                        validFrom,
                    },
                ],
            },
        ];
        for (const reminder of reminders) {
            const created = await api(baseUrl, rosa.token, 'POST', `/v1/profiles/${profileId}/reminders`, reminder, { 'x-installation-id': installationId });
            if (created.status !== 201) {
                throw new Error(`reminder ${reminder.title}: ${created.status}`);
            }
        }
        for (const [caregiver, category, hint] of [
            [ana, 'family', 'Ana'],
            [perez, 'medical', 'Dr. Pérez'],
        ]) {
            const invite = await api(baseUrl, rosa.token, 'POST', `/v1/profiles/${profileId}/invitations`, { recipientHint: hint }, { 'x-installation-id': installationId });
            if (invite.status !== 201) {
                throw new Error(`invite ${hint}: ${invite.status}`);
            }
            const secret = invite.json.secret;
            const accepted = await api(baseUrl, caregiver.token, 'POST', '/v1/invitations/accept', { secret, caregiverCategory: category });
            if (accepted.status !== 201 && accepted.status !== 200) {
                throw new Error(`accept ${hint}: ${accepted.status}`);
            }
        }
        const cane = (0, child_process_1.spawnSync)(process.execPath, [
            '--env-file=.env',
            '--import',
            'tsx',
            'scripts/register-cane.ts',
            '--serial',
            'GM-DEMO-001',
            '--model',
            'proto-esp32',
            '--code',
            'GMDEM-00001',
        ], { stdio: 'inherit', cwd: process.cwd() });
        if (cane.status !== 0) {
            throw new Error('register-cane demo falló');
        }
        process.stdout.write(`Demo OK: perfil ${profileId}, bastón GM-DEMO-001 / GMDEM-00001\n`);
    }
    finally {
        await app.close();
    }
}
main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
});
//# sourceMappingURL=seed-demo-users.js.map