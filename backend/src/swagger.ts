import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('GuardMe API')
      .setVersion('v1')
      .addBearerAuth()
      .addApiKey(
        { type: 'apiKey', name: 'X-Installation-Id', in: 'header' },
        'installation',
      )
      .build(),
  );
}

export function setupSwagger(app: INestApplication): void {
  if (process.env.NODE_ENV === 'production') return;
  SwaggerModule.setup('docs', app, createOpenApiDocument(app));
}
