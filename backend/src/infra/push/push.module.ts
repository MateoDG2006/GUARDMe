import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FakePushAdapter } from './fake-push.adapter';
import { FcmPushAdapter } from './fcm-push.adapter';
import { PushPort } from './push.port';

@Module({
  providers: [
    {
      provide: PushPort,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        if (config.getOrThrow<string>('PUSH_PROVIDER') === 'fcm') {
          return new FcmPushAdapter(config);
        }
        return new FakePushAdapter();
      },
    },
  ],
  exports: [PushPort],
})
export class PushModule {}
