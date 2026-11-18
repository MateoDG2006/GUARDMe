import { Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type PgBoss from 'pg-boss';
import { createBoss, PG_BOSS } from './pgboss.provider';

@Module({
  providers: [
    {
      provide: PG_BOSS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createBoss(config),
    },
  ],
  exports: [PG_BOSS],
})
export class QueueModule implements OnModuleDestroy {
  constructor(@Inject(PG_BOSS) private readonly boss: PgBoss) {}

  async onModuleDestroy(): Promise<void> {
    await this.boss.stop({ graceful: true }).catch(() => undefined);
  }
}
