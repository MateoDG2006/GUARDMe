import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import {
  DbService,
  PRISMA_API,
  PRISMA_INGEST,
  PRISMA_ONBOARDING,
  PRISMA_WORKER,
} from './db.service';

@Module({})
export class DbModule {
  static forApi(): DynamicModule {
    return {
      module: DbModule,
      global: true,
      providers: [
        prismaClient(PRISMA_API, 'DATABASE_URL_API'),
        prismaClient(PRISMA_ONBOARDING, 'DATABASE_URL_ONBOARDING'),
        prismaClient(PRISMA_INGEST, 'DATABASE_URL_INGEST'),
        DbService,
      ],
      exports: [DbService, PRISMA_API],
    };
  }

  static forWorker(): DynamicModule {
    return {
      module: DbModule,
      global: true,
      providers: [
        prismaClient(PRISMA_WORKER, 'DATABASE_URL_WORKER'),
        DbService,
      ],
      exports: [DbService],
    };
  }
}

function prismaClient(token: symbol, envName: string) {
  return {
    provide: token,
    inject: [ConfigService],
    useFactory: (config: ConfigService) =>
      new PrismaClient({
        datasourceUrl: config.getOrThrow<string>(envName),
      }),
  };
}
