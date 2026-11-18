import {
  ValidationPipe,
  type INestApplication,
  type ValidationError,
} from '@nestjs/common';
import { DomainError } from './common/errors/domain-error';
import { GlobalExceptionFilter } from './common/errors/global-exception.filter';

/** Misma validación, filtro y prefijo en API, seed y tests. */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) =>
        new DomainError('VALIDATION_FAILED', 'Validación fallida', {
          fields: flattenValidationErrors(errors),
        }),
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.setGlobalPrefix('v1', {
    exclude: ['health/live', 'health/ready'],
  });
}

function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): { field: string; messages: string[] }[] {
  const fields: { field: string; messages: string[] }[] = [];
  for (const error of errors) {
    const field = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      fields.push({ field, messages: Object.values(error.constraints) });
    }
    if (error.children && error.children.length > 0) {
      fields.push(...flattenValidationErrors(error.children, field));
    }
  }
  return fields;
}
