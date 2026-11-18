import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FakeTelephonyAdapter } from './fake-telephony.adapter';
import { NoneTelephonyAdapter } from './none-telephony.adapter';
import { TwilioTelephonyAdapter } from './twilio-telephony.adapter';
import { assertTelephonyAllowed, TelephonyPort } from './telephony.port';

@Module({
  providers: [
    {
      provide: TelephonyPort,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const nodeEnv = config.getOrThrow<string>('NODE_ENV');
        const provider = config.getOrThrow<string>('TELEPHONY_PROVIDER');
        assertTelephonyAllowed(nodeEnv, provider);
        if (provider === 'none') return new NoneTelephonyAdapter();
        if (provider === 'twilio') return new TwilioTelephonyAdapter(config);
        return new FakeTelephonyAdapter(config);
      },
    },
  ],
  exports: [TelephonyPort],
})
export class TelephonyModule {}
