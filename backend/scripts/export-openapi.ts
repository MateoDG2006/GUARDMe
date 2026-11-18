import { mkdirSync, writeFileSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { createOpenApiDocument } from '../src/swagger';

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('v1', { exclude: ['health/live', 'health/ready'] });
  const document = createOpenApiDocument(app);
  mkdirSync('openapi', { recursive: true });
  writeFileSync('openapi/guardme-v1.json', JSON.stringify(document, null, 2));
  await app.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
