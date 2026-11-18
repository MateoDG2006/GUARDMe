import { Throttle as NestThrottle } from '@nestjs/throttler';

const MINUTE = 60_000;
const DAY = 86_400_000;

export function Throttle(
  name: 'secrets' | 'invitations' | 'urgent' | 'telemetry',
): MethodDecorator {
  if (name === 'urgent') {
    return NestThrottle({ urgent: { limit: 60, ttl: MINUTE } });
  }
  if (name === 'telemetry') {
    return NestThrottle({ telemetry: { limit: 120, ttl: MINUTE } });
  }
  if (name === 'invitations') {
    return NestThrottle({ invitations: { limit: 20, ttl: DAY } });
  }
  return NestThrottle({
    secrets: { limit: 5, ttl: MINUTE },
    secretsDaily: { limit: 30, ttl: DAY },
  });
}
