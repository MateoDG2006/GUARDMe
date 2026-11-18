import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { getCorrelationId } from '../correlation/correlation.middleware';
import { DomainError, ERROR_HTTP_STATUS, type ErrorCode } from './domain-error';
import {
  isRecordNotFound,
  isUniqueViolation,
} from '../../infra/db/prisma-errors';

const HTTP_EXCEPTION_CODE: Partial<Record<number, ErrorCode>> = {
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN_ACTION',
  404: 'NOT_FOUND',
  409: 'INCOMPATIBLE_STATE',
  429: 'RATE_LIMITED',
};

type ErrorBody = {
  status: number;
  code: ErrorCode | 'INTERNAL';
  message: string;
  details: Record<string, unknown>;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const correlationId = getCorrelationId() ?? randomUUID();
    const mapped = this.map(exception);

    if (
      mapped.code === 'RATE_LIMITED' &&
      typeof mapped.details.retryAfter === 'number'
    ) {
      response.setHeader('Retry-After', String(mapped.details.retryAfter));
    }
    response.setHeader('X-Correlation-Id', correlationId);

    if (mapped.status >= 500) {
      this.logger.error({
        correlationId,
        code: mapped.code,
        err:
          exception instanceof Error
            ? { name: exception.name, message: exception.message }
            : String(exception),
      });
    }

    response.status(mapped.status).json({
      error: {
        code: mapped.code,
        message: mapped.message,
        correlationId,
        details: mapped.details,
      },
    });
  }

  private map(exception: unknown): ErrorBody {
    if (exception instanceof DomainError) {
      return {
        status: ERROR_HTTP_STATUS[exception.code],
        code: exception.code,
        message: exception.message,
        details: exception.details ?? {},
      };
    }

    if (isRecordNotFound(exception)) {
      return {
        status: 404,
        code: 'NOT_FOUND',
        message: 'Recurso no encontrado',
        details: {},
      };
    }

    if (isUniqueViolation(exception)) {
      return {
        status: 500,
        code: 'INTERNAL',
        message: 'Error interno',
        details: {},
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === 400) {
        return {
          status: 400,
          code: 'VALIDATION_FAILED',
          message: 'Validación fallida',
          details: { fields: httpExceptionFields(exception) },
        };
      }
      const code = HTTP_EXCEPTION_CODE[status];
      if (code) {
        return {
          status,
          code,
          message: exception.message,
          details: {},
        };
      }
    }

    return {
      status: 500,
      code: 'INTERNAL',
      message: 'Error interno',
      details: {},
    };
  }
}

function httpExceptionFields(
  exception: HttpException,
): { field?: string; message: string }[] {
  const body = exception.getResponse();
  if (typeof body === 'string') return [{ message: body }];
  if (body && typeof body === 'object' && 'message' in body) {
    const message = body.message;
    if (Array.isArray(message)) {
      return message.map((item) => ({ message: String(item) }));
    }
    return [{ message: String(message) }];
  }
  return [];
}
