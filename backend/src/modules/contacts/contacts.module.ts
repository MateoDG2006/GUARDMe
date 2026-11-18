import { Module } from '@nestjs/common';
import { PolicyConfig } from '../../config/policy.config';
import { AuditModule } from '../audit/audit.module';
import { SyncModule } from '../sync/sync.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';

@Module({
  imports: [AuditModule, ProfilesModule, SyncModule],
  controllers: [ContactsController],
  providers: [ContactsService, PolicyConfig],
})
export class ContactsModule {}
