/**
 * Seed piloto: Rosa (user), Ana y Dr. Pérez (cuidadores).
 * Credenciales: rosa@/ana@/perez@guardme.local · GuardMe!{rosa|ana|perez}
 * Bastón: GM-DEMO-001 / GMDEM-00001
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import {
  createAuth,
  mountAuth,
} from '../src/modules/identity/better-auth';
import { ConfigService } from '@nestjs/config';
import { spawnSync } from 'child_process';

const DEMO = {
  rosa: {
    email: 'rosa@guardme.local',
    password: 'GuardMe!rosa',
    name: 'Rosa Del Giudice',
    onboardingKind: 'self' as const,
  },
  ana: {
    email: 'ana@guardme.local',
    password: 'GuardMe!ana',
    name: 'Ana',
    onboardingKind: 'caregiver' as const,
  },
  perez: {
    email: 'perez@guardme.local',
    password: 'GuardMe!perez',
    name: 'Dr. Pérez',
    onboardingKind: 'caregiver' as const,
  },
};

type Session = { token: string; userId: string; accountId?: string };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function authConfig(): ConfigService {
  return {
    getOrThrow: (key: string) => {
      const value = process.env[key];
      if (!value) throw new Error(`Falta ${key}`);
      return value;
    },
  } as ConfigService;
}

async function signUp(
  email: string,
  password: string,
  name: string,
): Promise<Session> {
  const auth = await createAuth(authConfig());
  try {
    const result = (await auth.api.signUpEmail({
      body: { email, password, name },
    })) as {
      token?: string;
      user?: { id?: string };
      session?: { token?: string };
    };
    const token = result.token ?? result.session?.token;
    const userId = result.user?.id;
    if (!token || !userId) throw new Error(`Sin sesión para ${email}`);
    return { token, userId };
  } finally {
    await auth.$disconnect();
  }
}

async function api(
  baseUrl: string,
  token: string,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' && method !== 'DELETE'
        ? { 'idempotency-key': randomUUID() }
        : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  return { status: response.status, json };
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-demo-users no corre en producción');
  }

  const owner = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL_MIGRATIONS,
  });
  try {
    const existing = await owner.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n
      FROM identity.users
      WHERE email = 'rosa@guardme.local'
    `;
    if ((existing[0]?.n ?? 0) > 0) {
      process.stdout.write('Demo ya sembrado; nada que hacer.\n');
      return;
    }
  } finally {
    await owner.$disconnect();
  }

  const rosa = await signUp(DEMO.rosa.email, DEMO.rosa.password, DEMO.rosa.name);
  const ana = await signUp(DEMO.ana.email, DEMO.ana.password, DEMO.ana.name);
  const perez = await signUp(
    DEMO.perez.email,
    DEMO.perez.password,
    DEMO.perez.name,
  );

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
    rawBody: true,
  });
  await mountAuth(app);
  configureApp(app);
  await app.listen(0);
  const baseUrl = await app.getUrl();

  try {
    for (const [session, kind, displayName] of [
      [rosa, DEMO.rosa.onboardingKind, DEMO.rosa.name],
      [ana, DEMO.ana.onboardingKind, DEMO.ana.name],
      [perez, DEMO.perez.onboardingKind, DEMO.perez.name],
    ] as const) {
      const boot = await api(baseUrl, session.token, 'POST', '/v1/accounts/bootstrap', {
        onboardingKind: kind,
        displayName,
      });
      if (boot.status !== 201 && boot.status !== 200) {
        throw new Error(
          `bootstrap ${displayName}: ${boot.status} ${JSON.stringify(boot.json)}`,
        );
      }
      const bootBody = boot.json as { id?: string; account?: { id: string } };
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
      throw new Error(
        `perfil: ${profileRes.status} ${JSON.stringify(profileRes.json)}`,
      );
    }
    const profileId = (profileRes.json as { id: string }).id;

    const installRes = await api(baseUrl, rosa.token, 'POST', '/v1/installations', {
      clientInstallationId: randomUUID(),
      platform: 'android',
      appVersion: '0.0.1-demo',
    });
    if (installRes.status !== 201) {
      throw new Error(`installation: ${installRes.status}`);
    }
    const installationId = (installRes.json as { id: string }).id;

    // Sin linkedAccountId: el vínculo cuidador se crea después con invitaciones.
    const contacts = [
      {
        displayName: 'Ana',
        phone: '+50761000101',
        priority: 1 as const,
      },
      {
        displayName: 'Luis',
        phone: '+50761000102',
        priority: 2 as const,
      },
      { displayName: 'Dr. Pérez', phone: '+50761000103' },
      { displayName: 'Marta', phone: '+50761000104' },
      { displayName: 'Carmen', phone: '+50761000105' },
    ];
    let contactsVersion = 1;
    for (const contact of contacts) {
      const created = await api(
        baseUrl,
        rosa.token,
        'POST',
        `/v1/profiles/${profileId}/contacts`,
        { ...contact, expectedContactsVersion: contactsVersion },
        { 'x-installation-id': installationId },
      );
      if (created.status !== 201) {
        throw new Error(
          `contacto ${contact.displayName}: ${created.status} ${JSON.stringify(created.json)}`,
        );
      }
      contactsVersion = (created.json as { contactsVersion: number })
        .contactsVersion;
    }

    const validFrom = today();
    const reminders = [
      {
        kind: 'medication' as const,
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
        kind: 'medication' as const,
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
        kind: 'medication' as const,
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
      const created = await api(
        baseUrl,
        rosa.token,
        'POST',
        `/v1/profiles/${profileId}/reminders`,
        reminder,
        { 'x-installation-id': installationId },
      );
      if (created.status !== 201) {
        throw new Error(`reminder ${reminder.title}: ${created.status}`);
      }
    }

    for (const [caregiver, category, hint] of [
      [ana, 'family', 'Ana'] as const,
      [perez, 'medical', 'Dr. Pérez'] as const,
    ]) {
      const invite = await api(
        baseUrl,
        rosa.token,
        'POST',
        `/v1/profiles/${profileId}/invitations`,
        { recipientHint: hint },
        { 'x-installation-id': installationId },
      );
      if (invite.status !== 201) {
        throw new Error(`invite ${hint}: ${invite.status}`);
      }
      const secret = (invite.json as { secret: string }).secret;
      const accepted = await api(
        baseUrl,
        caregiver.token,
        'POST',
        '/v1/invitations/accept',
        { secret, caregiverCategory: category },
      );
      if (accepted.status !== 201 && accepted.status !== 200) {
        throw new Error(`accept ${hint}: ${accepted.status}`);
      }
    }

    const cane = spawnSync(
      process.execPath,
      [
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
      ],
      { stdio: 'inherit', cwd: process.cwd() },
    );
    if (cane.status !== 0) {
      throw new Error('register-cane demo falló');
    }

    process.stdout.write(
      `Demo OK: perfil ${profileId}, bastón GM-DEMO-001 / GMDEM-00001\n`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
