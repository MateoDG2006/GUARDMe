import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, type ThrottlerOptions } from '@nestjs/throttler';

@Injectable()
export class PrincipalThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    const principal = req.principal as
      | {
          authUserId?: string;
          accountId?: string | null;
          installationId?: string | null;
        }
      | undefined;
    return Promise.resolve(
      principal?.installationId ??
        principal?.accountId ??
        principal?.authUserId ??
        'sin-principal',
    );
  }
}

export function skipUnlessNamed(name: string) {
  const reflector = new Reflector();
  return (context: ExecutionContext): boolean =>
    reflector.getAllAndOverride<number>(`THROTTLER:LIMIT${name}`, [
      context.getHandler(),
      context.getClass(),
    ]) === undefined;
}

const NAMED = ['secrets', 'secretsDaily', 'invitations', 'urgent', 'telemetry'];

export const THROTTLERS: ThrottlerOptions[] = [
  {
    name: 'default',
    ttl: 60_000,
    limit: 300,
    skipIf: (context) => {
      const reflector = new Reflector();
      return NAMED.some(
        (name) =>
          reflector.getAllAndOverride<number>(`THROTTLER:LIMIT${name}`, [
            context.getHandler(),
            context.getClass(),
          ]) !== undefined,
      );
    },
  },
  {
    name: 'urgent',
    ttl: 60_000,
    limit: 60,
    skipIf: skipUnlessNamed('urgent'),
  },
  {
    name: 'telemetry',
    ttl: 60_000,
    limit: 120,
    skipIf: skipUnlessNamed('telemetry'),
  },
  {
    name: 'secrets',
    ttl: 60_000,
    limit: 5,
    skipIf: skipUnlessNamed('secrets'),
  },
  {
    name: 'secretsDaily',
    ttl: 86_400_000,
    limit: 30,
    skipIf: skipUnlessNamed('secretsDaily'),
  },
  {
    name: 'invitations',
    ttl: 86_400_000,
    limit: 20,
    skipIf: skipUnlessNamed('invitations'),
  },
];
