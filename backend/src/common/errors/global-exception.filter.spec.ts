import {
  BadRequestException,
  NotFoundException,
  type ArgumentsHost,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainError } from './domain-error';
import { GlobalExceptionFilter } from './global-exception.filter';

class FakeResponse {
  headers: Record<string, string> = {};
  statusCode = 0;
  body: unknown;

  setHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  json(body: unknown): void {
    this.body = body;
  }
}

function host(): { response: FakeResponse; host: ArgumentsHost } {
  const response = new FakeResponse();
  return {
    response,
    host: {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost,
  };
}

describe('GlobalExceptionFilter', () => {
  const filter = new GlobalExceptionFilter();

  it('maps a domain error to its HTTP status', () => {
    const { response, host: http } = host();
    filter.catch(
      new DomainError('VERSION_CONFLICT', 'versión vieja', { current: 4 }),
      http,
    );
    expect(response.statusCode).toBe(409);
    const body = response.body as {
      error: {
        code: string;
        message: string;
        correlationId: string;
        details: { current: number };
      };
    };
    expect(body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      message: 'versión vieja',
      details: { current: 4 },
    });
    expect(body.error.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('hides unknown failures', () => {
    const { response, host: http } = host();
    const boom = new Error('select * from secrets');
    boom.stack = 'STACKTRACE';
    filter.catch(boom, http);
    expect(response.statusCode).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('secrets');
    expect(JSON.stringify(response.body)).not.toContain('STACKTRACE');
    expect(response.body).toMatchObject({
      error: { code: 'INTERNAL', message: 'Error interno', details: {} },
    });
  });

  it('maps Prisma not found and treats unique violations as internal', () => {
    const missing = host();
    filter.catch(
      new Prisma.PrismaClientKnownRequestError('missing', {
        code: 'P2025',
        clientVersion: '6.19.3',
      }),
      missing.host,
    );
    expect(missing.response.statusCode).toBe(404);
    expect(missing.response.body).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });

    const unique = host();
    filter.catch(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
      unique.host,
    );
    expect(unique.response.statusCode).toBe(500);
    expect(unique.response.body).toMatchObject({ error: { code: 'INTERNAL' } });
  });

  it('keeps a missing route as not found', () => {
    const missing = host();
    filter.catch(new NotFoundException('Cannot GET /missing'), missing.host);
    expect(missing.response.statusCode).toBe(404);
    expect(missing.response.body).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });

  it('maps a bad request and sets Retry-After', () => {
    const bad = host();
    filter.catch(new BadRequestException(['email inválido']), bad.host);
    expect(bad.response.statusCode).toBe(400);
    expect(bad.response.body).toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        details: { fields: [{ message: 'email inválido' }] },
      },
    });

    const limited = host();
    filter.catch(
      new DomainError('RATE_LIMITED', 'espera', { retryAfter: 12 }),
      limited.host,
    );
    expect(limited.response.statusCode).toBe(429);
    expect(limited.response.headers['Retry-After']).toBe('12');
  });
});
