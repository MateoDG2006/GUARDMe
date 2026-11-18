import {
  Inject,
  Injectable,
  Optional,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export const PRISMA_API = Symbol('PRISMA_API');
export const PRISMA_ONBOARDING = Symbol('PRISMA_ONBOARDING');
export const PRISMA_WORKER = Symbol('PRISMA_WORKER');
export const PRISMA_INGEST = Symbol('PRISMA_INGEST');

export type Tx = Prisma.TransactionClient;

export interface AccountContext {
  accountId: string | null;
  authUserId: string;
  installationId: string | null;
}

const TX_MS = 10_000;

@Injectable()
export class DbService implements OnModuleDestroy {
  constructor(
    @Optional() @Inject(PRISMA_API) private readonly api?: PrismaClient,
    @Optional()
    @Inject(PRISMA_ONBOARDING)
    private readonly onboarding?: PrismaClient,
    @Optional() @Inject(PRISMA_WORKER) private readonly worker?: PrismaClient,
    @Optional() @Inject(PRISMA_INGEST) private readonly ingest?: PrismaClient,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      this.api?.$disconnect(),
      this.onboarding?.$disconnect(),
      this.worker?.$disconnect(),
      this.ingest?.$disconnect(),
    ]);
  }

  asAccount<T>(
    ctx: AccountContext,
    fn: (tx: Tx) => Promise<T>,
    opts?: { isolation?: 'ReadCommitted' | 'Serializable' },
  ): Promise<T> {
    return this.transaction(this.require(this.api, 'API'), ctx, fn, opts);
  }

  asOnboarding<T>(ctx: AccountContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.transaction(
      this.require(this.onboarding, 'onboarding'),
      ctx,
      fn,
    );
  }

  asWorker<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.transaction(this.require(this.worker, 'worker'), null, fn);
  }

  asIngest<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.transaction(this.require(this.ingest, 'ingest'), null, fn);
  }

  async pingApi(): Promise<void> {
    await this.require(this.api, 'API').$queryRaw`SELECT 1`;
  }

  asApi<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.transaction(this.require(this.api, 'API'), null, fn);
  }

  private require(
    client: PrismaClient | undefined,
    name: string,
  ): PrismaClient {
    if (!client) {
      throw new Error(
        `Cliente Prisma ${name} no está configurado en este proceso`,
      );
    }
    return client;
  }

  private transaction<T>(
    client: PrismaClient,
    ctx: AccountContext | null,
    fn: (tx: Tx) => Promise<T>,
    opts?: { isolation?: 'ReadCommitted' | 'Serializable' },
  ): Promise<T> {
    return client.$transaction(
      async (tx) => {
        if (ctx) {
          // SELECT: set_config devuelve el valor. $queryRaw mantiene los parámetros.
          await tx.$queryRaw`
            SELECT
              set_config('guardme.account_id', ${ctx.accountId ?? ''}, true),
              set_config('guardme.auth_user_id', ${ctx.authUserId}, true),
              set_config('guardme.installation_id', ${ctx.installationId ?? ''}, true)
          `;
        }
        return fn(tx);
      },
      {
        timeout: TX_MS,
        // La cola del pool comparte el mismo presupuesto: si no, T38 falla antes de empezar.
        maxWait: TX_MS,
        isolationLevel: isolationLevel(opts?.isolation),
      },
    );
  }
}

function isolationLevel(
  level?: 'ReadCommitted' | 'Serializable',
): Prisma.TransactionIsolationLevel | undefined {
  if (level === 'Serializable')
    return Prisma.TransactionIsolationLevel.Serializable;
  if (level === 'ReadCommitted') {
    return Prisma.TransactionIsolationLevel.ReadCommitted;
  }
  return undefined;
}
