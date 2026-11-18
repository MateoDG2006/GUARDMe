import { Injectable } from '@nestjs/common';
import { ClockPort } from '../../infra/clock/clock.port';
import type { Tx } from '../../infra/db/db.service';
import type { IncidentEventType } from './incident-state';

export interface AppendIncidentEvent {
  incidentId: string;
  type: IncidentEventType;
  actorKind: 'account' | 'installation' | 'system' | 'provider';
  actorAccountId: string | null;
  actorInstallationId: string | null;
  context?: Record<string, unknown>;
}

@Injectable()
export class IncidentEventsService {
  constructor(private readonly clock: ClockPort) {}

  async append(tx: Tx, input: AppendIncidentEvent): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO guardme.incident_events (
        incident_id,
        type,
        actor_kind,
        actor_account_id,
        actor_installation_id,
        at,
        context
      )
      VALUES (
        ${input.incidentId}::uuid,
        ${input.type},
        ${input.actorKind},
        ${input.actorAccountId}::uuid,
        ${input.actorInstallationId}::uuid,
        ${this.clock.now()}::timestamptz,
        ${JSON.stringify(input.context ?? {})}::jsonb
      )
    `;
  }
}
