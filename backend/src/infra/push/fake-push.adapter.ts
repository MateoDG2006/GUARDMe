import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { PushPort, type PushMessage, type PushResult } from './push.port';

@Injectable()
export class FakePushAdapter extends PushPort {
  readonly sent: PushMessage[] = [];
  private readonly scripted: PushResult['status'][] = [];

  failNext(status: 'token_invalid' | 'retryable' | 'failed'): void {
    this.scripted.push(status);
  }

  send(message: PushMessage): Promise<PushResult> {
    const status = this.scripted.shift();
    if (status === 'token_invalid') return Promise.resolve({ status });
    if (status === 'retryable' || status === 'failed') {
      return Promise.resolve({ status, error: status });
    }
    this.sent.push(message);
    return Promise.resolve({
      status: 'accepted',
      providerRef: `fake-${randomUUID()}`,
    });
  }
}
