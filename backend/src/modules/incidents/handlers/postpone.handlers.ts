import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PolicyConfig } from '../../../config/policy.config';
import { ClockPort } from '../../../infra/clock/clock.port';
import { DbService, type Tx } from '../../../infra/db/db.service';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  type ActionHandler,
  type HandlerResult,
  type PendingActionRow,
} from '../../pending-actions/action-handler';
import { AccessService } from '../../profiles/access.service';
import { IncidentEventsService } from '../incident-events.service';

@Injectable()
export class PostponeReminderHandler implements ActionHandler {
  readonly types = ['POSTPONE_REMINDER'] as const;

  constructor(
    private readonly db: DbService,
    private readonly clock: ClockPort,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly events: IncidentEventsService,
  ) {}

  handle(action: PendingActionRow): Promise<HandlerResult> {
    return this.db.asWorker((tx) => this.apply(tx, action));
  }

  private async apply(
    tx: Tx,
    action: PendingActionRow,
  ): Promise<HandlerResult> {
    const decisionId = stringField(action.payload, 'decisionId');
    const accountId = stringField(action.payload, 'accountId');
    if (!decisionId || !accountId) {
      return { outcome: 'discarded', reason: 'missing_decision' };
    }
    const rows = await tx.$queryRaw<
      Array<{
        status: string;
        profile_id: string;
        version: number;
        latest_id: string | null;
      }>
    >`
      SELECT
        i.status, i.profile_id, i.version,
        (
          SELECT d.id FROM guardme.caregiver_decisions d
          WHERE d.incident_id = i.id
          ORDER BY d.at DESC, d.id DESC
          LIMIT 1
        ) AS latest_id
      FROM guardme.incidents i
      WHERE i.id = ${action.resourceId}::uuid
    `;
    const incident = rows[0];
    if (
      !incident ||
      incident.status !== 'attention_postponed' ||
      incident.latest_id !== decisionId
    ) {
      return { outcome: 'discarded', reason: 'stale_decision' };
    }
    const ttl = this.config.getOrThrow<number>('INCIDENT_NOTIFICATION_TTL_SEC');
    await this.notifications.createForRecipients(tx, {
      type: 'postpone_reminder',
      profileId: incident.profile_id,
      recipientAccountIds: [accountId],
      resourceType: 'incident',
      resourceId: action.resourceId,
      resourceVersion: incident.version,
      dedupeScope: `postpone:${decisionId}:reminder`,
      priority: 'attention',
      expiresAt: new Date(this.clock.now().getTime() + ttl * 1000),
    });
    await this.events.append(tx, {
      incidentId: action.resourceId,
      type: 'postpone_reminder_sent',
      actorKind: 'system',
      actorAccountId: null,
      actorInstallationId: null,
      context: { decisionId },
    });
    return { outcome: 'done' };
  }
}

@Injectable()
export class PostponeCollectiveHandler implements ActionHandler {
  readonly types = ['POSTPONE_COLLECTIVE'] as const;

  constructor(
    private readonly db: DbService,
    private readonly clock: ClockPort,
    private readonly config: ConfigService,
    private readonly policy: PolicyConfig,
    private readonly notifications: NotificationsService,
    private readonly events: IncidentEventsService,
    private readonly access: AccessService,
  ) {}

  handle(action: PendingActionRow): Promise<HandlerResult> {
    return this.db.asWorker((tx) => this.apply(tx, action));
  }

  private async apply(
    tx: Tx,
    action: PendingActionRow,
  ): Promise<HandlerResult> {
    const decisionId = stringField(action.payload, 'decisionId');
    if (!decisionId)
      return { outcome: 'discarded', reason: 'missing_decision' };
    const rows = await tx.$queryRaw<
      Array<{
        status: string;
        profile_id: string;
        version: number;
        latest_id: string | null;
      }>
    >`
      SELECT
        i.status, i.profile_id, i.version,
        (
          SELECT d.id FROM guardme.caregiver_decisions d
          WHERE d.incident_id = i.id
          ORDER BY d.at DESC, d.id DESC
          LIMIT 1
        ) AS latest_id
      FROM guardme.incidents i
      WHERE i.id = ${action.resourceId}::uuid
    `;
    const incident = rows[0];
    if (
      !incident ||
      incident.status !== 'attention_postponed' ||
      incident.latest_id !== decisionId
    ) {
      return { outcome: 'discarded', reason: 'stale_decision' };
    }
    // PD-05/PD-06 pendientes
    if (this.policy.postponeCollectiveRecipients !== 'all_caregivers') {
      return { outcome: 'discarded', reason: 'policy' };
    }
    const caregivers = await this.access.listActiveAccounts(
      tx,
      incident.profile_id,
      'caregiver',
    );
    const ttl = this.config.getOrThrow<number>('INCIDENT_NOTIFICATION_TTL_SEC');
    await this.notifications.createForRecipients(tx, {
      type: 'postpone_collective',
      profileId: incident.profile_id,
      recipientAccountIds: caregivers.map((row) => row.accountId),
      resourceType: 'incident',
      resourceId: action.resourceId,
      resourceVersion: incident.version,
      dedupeScope: `postpone:${decisionId}:collective`,
      priority: 'attention',
      expiresAt: new Date(this.clock.now().getTime() + ttl * 1000),
    });
    await this.events.append(tx, {
      incidentId: action.resourceId,
      type: 'postpone_collective_sent',
      actorKind: 'system',
      actorAccountId: null,
      actorInstallationId: null,
      context: { decisionId, recipients: caregivers.length },
    });
    return { outcome: 'done' };
  }
}

function stringField(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];
  return typeof value === 'string' ? value : null;
}
