import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, of, type Observable } from 'rxjs';
import { concatMap, switchMap } from 'rxjs/operators';
import { DomainError } from '../errors/domain-error';
import { DbService } from '../../infra/db/db.service';
import { IDEMPOTENT } from './idempotent.decorator';
import { requestHash } from './canonical-json';
import {
  toAccountContext,
  type Principal,
} from '../../modules/identity/principal';

const KEY_RE = /^[A-Za-z0-9_-]{1,100}$/;

interface StoredResponse {
  route: string;
  request_hash: string;
  status_code: number;
  response_body: unknown;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    private readonly db: DbService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.reflector.get<boolean>(IDEMPOTENT, context.getHandler())) {
      return next.handle();
    }
    const http = context.switchToHttp();
    const request = http.getRequest<{
      method: string;
      baseUrl: string;
      path: string;
      route?: { path?: string };
      body: unknown;
      header: (name: string) => string | undefined;
      principal?: Principal;
    }>();
    const response = http.getResponse<{
      statusCode: number;
      setHeader: (name: string, value: string) => void;
      status: (code: number) => void;
    }>();
    const key = request.header('idempotency-key');
    if (!key || !KEY_RE.test(key)) {
      throw new DomainError('VALIDATION_FAILED', 'Validación fallida', {
        fields: [{ field: 'Idempotency-Key', messages: ['requerida'] }],
      });
    }
    const principal = request.principal;
    if (!principal?.accountId) {
      throw new DomainError('ACCOUNT_NOT_BOOTSTRAPPED');
    }
    const route = `${request.method} ${request.baseUrl}${request.route?.path ?? request.path}`;
    const hash = requestHash(request.body);
    return from(this.lookup(principal, key)).pipe(
      switchMap((existing) => {
        if (existing) {
          if (existing.request_hash !== hash || existing.route !== route) {
            throw new DomainError('IDEMPOTENCY_KEY_REUSED');
          }
          response.setHeader('X-Idempotent-Replay', 'true');
          response.status(existing.status_code);
          return of(existing.response_body);
        }
        return next
          .handle()
          .pipe(
            concatMap((body) =>
              from(
                this.store(
                  principal,
                  key,
                  route,
                  hash,
                  response.statusCode,
                  body,
                ),
              ).pipe(concatMap(() => of(body))),
            ),
          );
      }),
    );
  }

  private lookup(
    principal: Principal,
    key: string,
  ): Promise<StoredResponse | undefined> {
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const rows = await tx.$queryRaw<StoredResponse[]>`
        SELECT route, request_hash, status_code, response_body
        FROM guardme.idempotency_keys
        WHERE account_id = ${principal.accountId}::uuid
          AND key = ${key}
      `;
      return rows[0];
    });
  }

  private async store(
    principal: Principal,
    key: string,
    route: string,
    hash: string,
    statusCode: number,
    body: unknown,
  ): Promise<void> {
    if (statusCode < 200 || statusCode >= 300) return;
    // shortcut: la clave se guarda después del handler, no en su transacción; dos peticiones simultáneas con la misma clave pueden ejecutar el handler dos veces. Los handlers que lo usan deben ser seguros por sus propias restricciones únicas/bloqueos. Mover al mismo tx si aparece un caso real.
    await this.db.asAccount(
      toAccountContext(principal),
      (tx) =>
        tx.$executeRaw`
        INSERT INTO guardme.idempotency_keys (
          account_id, key, route, request_hash, status_code, response_body
        )
        VALUES (
          ${principal.accountId}::uuid,
          ${key},
          ${route},
          ${hash},
          ${statusCode},
          ${JSON.stringify(body ?? {})}::jsonb
        )
        ON CONFLICT (account_id, key) DO NOTHING
      `,
    );
  }
}
