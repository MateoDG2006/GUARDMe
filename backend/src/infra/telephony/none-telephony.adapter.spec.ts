import { ConfigService } from '@nestjs/config';
import { CapabilitiesService } from '../../modules/identity/capabilities.service';
import { PolicyConfig } from '../../config/policy.config';
import { NoneTelephonyAdapter } from './none-telephony.adapter';
import { assertTelephonyAllowed } from './telephony.port';

describe('NoneTelephonyAdapter', () => {
  it('boots under production with telephony none', () => {
    expect(() => assertTelephonyAllowed('production', 'none')).not.toThrow();
    const adapter = new NoneTelephonyAdapter();
    expect(adapter.provider).toBe('none');
  });

  it('reports telephony not_enabled from TELEPHONY_PROVIDER', () => {
    const config = {
      getOrThrow: (key: string) => {
        if (key === 'TELEPHONY_PROVIDER') return 'none';
        if (key === 'PUSH_PROVIDER') return 'fake';
        if (key === 'LOCATION_ENABLED') return true;
        throw new Error(key);
      },
    } as ConfigService;
    const policy = {
      pendingPolicies: [],
    } as unknown as PolicyConfig;
    const capabilities = new CapabilitiesService(config, policy).get();
    expect(capabilities.telephony).toBe('not_enabled');
  });

  it('reports telephony enabled when TELEPHONY_PROVIDER=twilio', () => {
    const config = {
      getOrThrow: (key: string) => {
        if (key === 'TELEPHONY_PROVIDER') return 'twilio';
        if (key === 'PUSH_PROVIDER') return 'fake';
        if (key === 'LOCATION_ENABLED') return true;
        throw new Error(key);
      },
    } as ConfigService;
    const policy = {
      pendingPolicies: [],
    } as unknown as PolicyConfig;
    const capabilities = new CapabilitiesService(config, policy).get();
    expect(capabilities.telephony).toBe('enabled');
  });
});
