import { Injectable } from '@nestjs/common';
import type { CountryCode } from 'libphonenumber-js';
import { DomainError } from '../../common/errors/domain-error';
import { PolicyConfig } from '../../config/policy.config';
import { DbService, type Tx } from '../../infra/db/db.service';
import { AuditService } from '../audit/audit.service';
import { SyncSignalService } from '../sync/sync-signal.service';
import { toAccountContext, type Principal } from '../identity/principal';
import { AccessService } from '../profiles/access.service';
import type { CreateContactDto, UpdateContactsDto } from './dto/contact.dto';
import { normalizePhone } from './phone';

export interface ContactView {
  id: string;
  displayName: string;
  phoneE164: string;
  priority: 1 | 2 | null;
  linkedAccountId: string | null;
  version: number;
}

export interface ContactListView {
  contactsVersion: number;
  items: ContactView[];
}

interface ContactRow {
  id: string;
  display_name: string;
  phone_e164: string;
  priority: number | null;
  linked_account_id: string | null;
  version: number;
}

@Injectable()
export class ContactsService {
  constructor(
    private readonly db: DbService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly sync: SyncSignalService,
    private readonly policy: PolicyConfig,
  ) {}

  list(principal: Principal, profileId: string): Promise<ContactListView> {
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      await this.access.requireAccess(tx, profileId);
      return this.readList(tx, profileId);
    });
  }

  create(
    principal: Principal,
    profileId: string,
    input: CreateContactDto,
  ): Promise<ContactListView> {
    const phone = this.phoneOf(input.phone);
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      await this.access.requireAccess(tx, profileId);
      await this.lockVersion(tx, profileId, input.expectedContactsVersion);
      if (input.linkedAccountId) {
        await this.requireCaregiverLink(tx, profileId, input.linkedAccountId);
      }
      // Un solo activo por prioridad (1|2). FOR UPDATE serializa; luego libera e inserta
      // en statements separados (un CTE UPDATE+INSERT corre en paralelo en Postgres y choca).
      const priority =
        input.priority === 1 || input.priority === 2 ? input.priority : null;
      await tx.$queryRaw`
        SELECT id
        FROM guardme.contacts
        WHERE profile_id = ${profileId}::uuid
          AND status = 'active'
        FOR UPDATE
      `;
      if (priority != null) {
        await tx.$executeRaw`
          UPDATE guardme.contacts
          SET priority = NULL
          WHERE profile_id = ${profileId}::uuid
            AND status = 'active'
            AND priority = ${priority}::smallint
        `;
      }
      await tx.$executeRaw`
        INSERT INTO guardme.contacts (
          profile_id, display_name, phone_e164, priority, linked_account_id
        )
        VALUES (
          ${profileId}::uuid,
          ${input.displayName},
          ${phone},
          ${priority}::smallint,
          ${input.linkedAccountId ?? null}::uuid
        )
      `;
      return this.finish(tx, principal, profileId);
    });
  }

  replaceOrder(
    principal: Principal,
    profileId: string,
    input: UpdateContactsDto,
  ): Promise<ContactListView> {
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      await this.access.requireAccess(tx, profileId);
      await this.lockVersion(tx, profileId, input.expectedContactsVersion);
      await tx.$executeRaw`
        UPDATE guardme.contacts
        SET priority = NULL
        WHERE profile_id = ${profileId}::uuid
          AND status = 'active'
      `;
      for (const item of input.items) {
        const phone = item.phone ? this.phoneOf(item.phone) : null;
        const updated = await tx.$executeRaw`
          UPDATE guardme.contacts
          SET display_name = COALESCE(${item.displayName ?? null}, display_name),
              phone_e164 = COALESCE(${phone}, phone_e164),
              priority = ${item.priority}
          WHERE id = ${item.id}::uuid
            AND profile_id = ${profileId}::uuid
            AND status = 'active'
        `;
        if (updated === 0) throw new DomainError('NOT_FOUND');
      }
      return this.finish(tx, principal, profileId);
    });
  }

  remove(
    principal: Principal,
    profileId: string,
    contactId: string,
    expectedContactsVersion: number,
  ): Promise<ContactListView> {
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      await this.access.requireAccess(tx, profileId);
      await this.lockVersion(tx, profileId, expectedContactsVersion);
      const updated = await tx.$executeRaw`
        UPDATE guardme.contacts
        SET status = 'removed',
            priority = NULL
        WHERE id = ${contactId}::uuid
          AND profile_id = ${profileId}::uuid
          AND status = 'active'
      `;
      if (updated === 0) throw new DomainError('NOT_FOUND');
      return this.finish(tx, principal, profileId);
    });
  }

  private phoneOf(raw: string): string {
    const phone = normalizePhone(
      raw,
      this.policy.defaultPhoneRegion as CountryCode,
    );
    if (!phone) {
      throw new DomainError('VALIDATION_FAILED', 'Validación fallida', {
        fields: [{ field: 'phone', messages: ['teléfono inválido'] }],
      });
    }
    return phone;
  }

  private async requireCaregiverLink(
    tx: Tx,
    profileId: string,
    accountId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM guardme.profile_access
      WHERE profile_id = ${profileId}::uuid
        AND account_id = ${accountId}::uuid
        AND relation = 'caregiver'
        AND status = 'active'
    `;
    if (!rows[0]) {
      throw new DomainError('VALIDATION_FAILED', 'Validación fallida', {
        field: 'linkedAccountId',
      });
    }
  }

  private async lockVersion(
    tx: Tx,
    profileId: string,
    expected: number,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ contacts_version: number }>>`
      SELECT contacts_version
      FROM guardme.profiles
      WHERE id = ${profileId}::uuid
      FOR UPDATE
    `;
    const current = rows[0]?.contacts_version;
    if (current === undefined) throw new DomainError('NOT_FOUND');
    if (current !== expected) {
      throw new DomainError('VERSION_CONFLICT', undefined, {
        current: await this.readList(tx, profileId),
      });
    }
  }

  private async finish(
    tx: Tx,
    principal: Principal,
    profileId: string,
  ): Promise<ContactListView> {
    await tx.$executeRaw`
      UPDATE guardme.profiles
      SET contacts_version = contacts_version + 1
      WHERE id = ${profileId}::uuid
    `;
    const list = await this.readList(tx, profileId);
    await this.sync.requestSyncSignal(tx, profileId, 'changes');
    await this.audit.record(tx, {
      operation: 'contacts.change',
      result: 'ok',
      actorKind: 'account',
      actorAccountId: principal.accountId,
      profileId,
      details: {
        priorities: list.items.map((item) => ({
          id: item.id,
          priority: item.priority,
          phone: item.phoneE164,
        })),
      },
    });
    return list;
  }

  private async readList(tx: Tx, profileId: string): Promise<ContactListView> {
    const versions = await tx.$queryRaw<Array<{ contacts_version: number }>>`
      SELECT contacts_version FROM guardme.profiles WHERE id = ${profileId}::uuid
    `;
    const items = await tx.$queryRaw<ContactRow[]>`
      SELECT id, display_name, phone_e164, priority, linked_account_id, version
      FROM guardme.contacts
      WHERE profile_id = ${profileId}::uuid
        AND status = 'active'
      ORDER BY priority NULLS LAST, display_name
    `;
    return {
      contactsVersion: versions[0]?.contacts_version ?? 1,
      items: items.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        phoneE164: row.phone_e164,
        priority:
          row.priority === 1 || row.priority === 2 ? row.priority : null,
        linkedAccountId: row.linked_account_id,
        version: row.version,
      })),
    };
  }
}
