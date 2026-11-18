import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { ClockPort } from '../../infra/clock/clock.port';
import type { Tx } from '../../infra/db/db.service';

export interface ResolvedGateway {
  caneId: string;
  caneAssignmentId: string;
  profileId: string;
  gatewayId: string;
}

@Injectable()
export class GatewayResolverService {
  constructor(private readonly clock: ClockPort) {}

  async resolveActive(
    tx: Tx,
    installationId: string,
    caneId: string,
  ): Promise<ResolvedGateway> {
    const rows = await tx.$queryRaw<
      Array<{
        gateway_id: string;
        cane_assignment_id: string;
        profile_id: string;
      }>
    >`
      SELECT g.id AS gateway_id, g.cane_assignment_id, a.profile_id
      FROM guardme.gateways g
      JOIN guardme.cane_assignments a ON a.id = g.cane_assignment_id
      WHERE g.installation_id = ${installationId}::uuid
        AND g.cane_id = ${caneId}::uuid
        AND g.ended_at IS NULL
        AND a.ended_at IS NULL
    `;
    const row = rows[0];
    if (!row) {
      throw new DomainError('FORBIDDEN_ACTION', undefined, {
        reason: 'not_active_gateway',
      });
    }
    const now = this.clock.now();
    await tx.$executeRaw`
      UPDATE guardme.gateways
      SET last_event_at = ${now}
      WHERE id = ${row.gateway_id}::uuid
    `;
    await tx.$executeRaw`
      UPDATE guardme.installations
      SET last_seen_at = ${now}
      WHERE id = ${installationId}::uuid
    `;
    return {
      caneId,
      caneAssignmentId: row.cane_assignment_id,
      profileId: row.profile_id,
      gatewayId: row.gateway_id,
    };
  }
}
