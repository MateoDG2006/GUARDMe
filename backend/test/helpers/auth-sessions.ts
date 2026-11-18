import { ConfigService } from '@nestjs/config';
import { createAuth } from '../../src/modules/identity/better-auth';

export interface TestSession {
  userId: string;
  accessToken: string;
  sessionToken: string;
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

function readToken(result: unknown): { token: string; userId: string } {
  const record = result as {
    token?: string;
    user?: { id?: string };
    session?: { token?: string };
  };
  const token = record.token ?? record.session?.token;
  const userId = record.user?.id;
  if (!token || !userId) throw new Error('Sin sesión de prueba');
  return { token, userId };
}

export async function createEmailSession(
  email: string,
  password: string,
  name = 'Test',
): Promise<TestSession> {
  const auth = await createAuth(authConfig());
  try {
    const result = await auth.api.signUpEmail({
      body: { email, password, name },
    });
    const { token, userId } = readToken(result);
    return { userId, accessToken: token, sessionToken: token };
  } finally {
    await auth.$disconnect();
  }
}

export async function createAnonymousSession(): Promise<TestSession> {
  const auth = await createAuth(authConfig());
  try {
    const result = await auth.api.signInAnonymous({});
    const { token, userId } = readToken(result);
    return { userId, accessToken: token, sessionToken: token };
  } finally {
    await auth.$disconnect();
  }
}

export async function signOut(session: TestSession): Promise<void> {
  const auth = await createAuth(authConfig());
  try {
    await auth.api.signOut({
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
  } finally {
    await auth.$disconnect();
  }
}
