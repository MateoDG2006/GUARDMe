import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainError } from '../../common/errors/domain-error';
import { ClockPort } from '../../infra/clock/clock.port';
import { DbService, type Tx } from '../../infra/db/db.service';
import { AuditService } from '../audit/audit.service';
import { toAccountContext, type Principal } from '../identity/principal';
import { AccessService } from '../profiles/access.service';
import { CanesService, type CaneView } from './canes.service';

@Injectable()
export class GatewaysService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly clock: ClockPort,
    @Inject(forwardRef(() => AccessService))
    private readonly access: AccessService,
    @Inject(forwardRef(() => CanesService))
    private readonly canes: CanesService,
  ) {}

  setGateway(principal: Principal, caneId: string): Promise<CaneView> {
    if (!principal.installationId) {
      throw new DomainError('INSTALLATION_MISMATCH');
    }
    const now = this.clock.now();
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      const assignment = await tx.$queryRaw<
        Array<{ id: string; profile_id: string }>
      >`
        SELECT id, profile_id
        FROM guardme.cane_assignments
        WHERE cane_id = ${caneId}::uuid
          AND ended_at IS NULL
      `;
      const row = assignment[0];
      if (!row) throw new DomainError('NOT_FOUND');
      const mine = await this.access.requireAccess(tx, row.profile_id);
      if (mine.relation !== 'user') {
        throw new DomainError('FORBIDDEN_ACTION', undefined, {
          reason: 'gateway_must_be_user_phone',
        });
      }
      await tx.$queryRaw`
        SELECT id
        FROM guardme.cane_assignments
        WHERE id = ${row.id}::uuid
        FOR UPDATE
      `;
      const current = await tx.$queryRaw<Array<{ installation_id: string }>>`
        SELECT installation_id
        FROM guardme.gateways
        WHERE cane_id = ${caneId}::uuid
          AND ended_at IS NULL
      `;
      if (current[0]?.installation_id === principal.installationId) {
        return this.canes.loadView(tx, caneId, principal.installationId);
      }
      await tx.$executeRaw`
        UPDATE guardme.gateways
        SET ended_at = ${now},
            end_reason = 'replaced'
        WHERE cane_id = ${caneId}::uuid
          AND ended_at IS NULL
      `;
      await tx.$executeRaw`
        INSERT INTO guardme.gateways (cane_id, cane_assignment_id, installation_id)
        VALUES (
          ${caneId}::uuid,
          ${row.id}::uuid,
          ${principal.installationId}::uuid
        )
      `;
      await this.audit.record(tx, {
        operation: 'gateway.set',
        result: 'ok',
        actorKind: 'installation',
        actorAccountId: principal.accountId,
        profileId: row.profile_id,
        details: { caneId, installationId: principal.installationId },
      });
      return this.canes.loadView(tx, caneId, principal.installationId);
    });
  }

  async closeForInstallations(
    tx: Tx,
    installationIds: string[],
    reason: 'installation_revoked' | 'access_revoked',
  ): Promise<number> {
    if (installationIds.length === 0) return 0;
    const ids = Prisma.join(
      installationIds.map((id) => Prisma.sql`${id}::uuid`),
    );
    return tx.$executeRaw`
      UPDATE guardme.gateways
      SET ended_at = ${this.clock.now()},
          end_reason = ${reason}
      WHERE ended_at IS NULL
        AND installation_id IN (${ids})
    `;
  }
}
