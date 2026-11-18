import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClockPort } from '../../../infra/clock/clock.port';
import { DbService } from '../../../infra/db/db.service';
import type { NotificationType } from '../../../infra/push/push.port';
import { IncidentEventsService } from '../../incidents/incident-events.service';
import {
  type ActionHandler,
  type HandlerResult,
  type PendingActionRow,
} from '../../pending-actions/action-handler';
import { NotificationsService } from '../notifications.service';

@Injectable()
export class NotifyIncidentHandler implements ActionHandler {
  readonly types = ['NOTIFY_INCIDENT', 'NOTIFY_INCIDENT_UPDATE'] as const;

  constructor(
    private readonly db: DbService,
    private readonly clock: ClockPort,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly events: IncidentEventsService,
  ) {}

  handle(action: PendingActionRow): Promise<HandlerResult> {
    return this.db.asWorker(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          profile_id: string;
          origin: string;
          status: string;
          is_delayed: boolean;
          version: number;
        }>
      >`
        SELECT id, profile_id, origin, status, is_delayed, version
        FROM guardme.incidents
        WHERE id = ${action.resourceId}::uuid
      `;
      const incident = rows[0];
      if (!incident)
        return { outcome: 'discarded', reason: 'missing_incident' };
      if (obsolete(action, incident.status, incident.version)) {
        return { outcome: 'discarded', reason: 'stale_resource' };
      }
      if (
        action.type === 'NOTIFY_INCIDENT' &&
        incident.status === 'closed_assisted'
      ) {
        return { outcome: 'discarded', reason: 'closed' };
      }
      const recipients = await tx.$queryRaw<Array<{ account_id: string }>>`
        SELECT account_id
        FROM guardme.profile_access
        WHERE profile_id = ${incident.profile_id}::uuid
          AND status = 'active'
          AND relation = 'caregiver'
      `;
      // PD-05 pendiente
      if (recipients.length === 0) {
        await this.events.append(tx, {
          incidentId: incident.id,
          type: 'notification_scheduled',
          actorKind: 'system',
          actorAccountId: null,
          actorInstallationId: null,
          context: { recipients: 0 },
        });
        return { outcome: 'done' };
      }
      const type = notificationType(
        action.type,
        incident.origin,
        incident.is_delayed,
      );
      const priority =
        type === 'incident_delayed' || type === 'incident_update'
          ? 'attention'
          : 'urgent';
      const ttl = this.config.getOrThrow<number>(
        'INCIDENT_NOTIFICATION_TTL_SEC',
      );
      await this.notifications.createForRecipients(tx, {
        type,
        profileId: incident.profile_id,
        recipientAccountIds: recipients.map((row) => row.account_id),
        resourceType: 'incident',
        resourceId: incident.id,
        resourceVersion: incident.version,
        dedupeScope:
          action.type === 'NOTIFY_INCIDENT_UPDATE'
            ? `incident:${incident.id}:update`
            : `incident:${incident.id}:activated`,
        priority,
        expiresAt: new Date(this.clock.now().getTime() + ttl * 1000),
      });
      return { outcome: 'done' };
    });
  }
}

function notificationType(
  actionType: string,
  origin: string,
  delayed: boolean,
): NotificationType {
  if (actionType === 'NOTIFY_INCIDENT_UPDATE') return 'incident_update';
  if (delayed) return 'incident_delayed';
  if (origin === 'manual_emergency') return 'incident_manual';
  return 'incident_fall';
}

function obsolete(
  action: PendingActionRow,
  status: string,
  version: number,
): boolean {
  const expectedStatus = action.payload.expectedStatus;
  const expectedVersion = action.payload.expectedVersion;
  if (typeof expectedStatus === 'string' && expectedStatus !== status)
    return true;
  if (typeof expectedVersion === 'number' && expectedVersion !== version)
    return true;
  return false;
}
