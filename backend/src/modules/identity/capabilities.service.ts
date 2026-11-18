import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PolicyConfig } from '../../config/policy.config';

export interface Capabilities {
  telephony: 'fake' | 'enabled' | 'not_enabled';
  push: 'fake' | 'fcm';
  emergencyAutoCall: 'not_enabled';
  voiceInApp: 'not_enabled';
  location: 'enabled' | 'not_enabled';
  pendingPolicies: string[];
}

@Injectable()
export class CapabilitiesService {
  constructor(
    private readonly config: ConfigService,
    private readonly policy: PolicyConfig,
  ) {}

  get(): Capabilities {
    const push = this.config.getOrThrow<string>('PUSH_PROVIDER');
    const telephony = this.config.getOrThrow<string>('TELEPHONY_PROVIDER');
    return {
      telephony:
        telephony === 'fake'
          ? 'fake'
          : telephony === 'twilio'
            ? 'enabled'
            : 'not_enabled',
      push: push === 'fcm' ? 'fcm' : 'fake',
      emergencyAutoCall: 'not_enabled',
      voiceInApp: 'not_enabled',
      location: this.config.getOrThrow<boolean>('LOCATION_ENABLED')
        ? 'enabled'
        : 'not_enabled',
      pendingPolicies: [...this.policy.pendingPolicies],
    };
  }
}
