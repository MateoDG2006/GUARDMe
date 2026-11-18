import { DomainError } from '../../common/errors/domain-error';
import {
  TelephonyPort,
  type CreateCallInput,
  type CreateCallResult,
  type ParsedProviderEvent,
  type ProviderCallSnapshot,
} from './telephony.port';

export class NoneTelephonyAdapter extends TelephonyPort {
  readonly provider = 'none';

  createCall(_input: CreateCallInput): Promise<CreateCallResult> {
    return Promise.resolve({ status: 'rejected', error: 'not_enabled' });
  }

  findCallByAttempt(_attemptId: string): Promise<ProviderCallSnapshot | null> {
    return Promise.resolve(null);
  }

  cancelCall(_providerRef: string): Promise<void> {
    return Promise.resolve();
  }

  verifyAndParseWebhook(
    _headers: Record<string, string>,
    _rawBody: Buffer,
  ): ParsedProviderEvent[] {
    throw new DomainError('UNAUTHENTICATED');
  }
}
