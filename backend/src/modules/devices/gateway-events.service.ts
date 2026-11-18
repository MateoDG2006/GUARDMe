import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { PolicyConfig } from '../../config/policy.config';
import { ClockPort } from '../../infra/clock/clock.port';
import { DbService, type Tx } from '../../infra/db/db.service';
import { fallSourceKey } from '../incidents/incidents.service';
import { IncidentEventsService } from '../incidents/incident-events.service';
import { toAccountContext, type Principal } from '../identity/principal';
import { AccessService } from '../profiles/access.service';
import type { GatewayEventsBatchDto } from './dto/gateway-events.dto';
import { GatewayResolverService } from './gateway-resolver.service';

export type GatewayEventItemResult = {
  eventId: string;
  status: 'accepted' | 'duplicate' | 'rejected';
  code?: 'NOT_ACTIVE_GATEWAY' | 'EVENT_TOO_OLD' | 'VALIDATION_FAILED';
};

const EVENT_ID = /^[A-Za-z0-9:_-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class GatewayEventsService {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockPort,
    private readonly policy: PolicyConfig,
    private readonly resolver: GatewayResolverService,
    private readonly access: AccessService,
    @Inject(forwardRef(() => IncidentEventsService))
    private readonly incidentEvents: IncidentEventsService,
  ) {}

  async ingestBatch(
    principal: Principal,
    input: GatewayEventsBatchDto,
  ): Promise<{ results: GatewayEventItemResult[] }> {
    const installationId = principal.installationId;
    if (!installationId) throw new DomainError('INSTALLATION_MISMATCH');
    const results: GatewayEventItemResult[] = [];
    for (const item of input.events) {
      results.push(await this.ingestOne(principal, installationId, item));
    }
    return { results };
  }

  listFalseAlarms(
    principal: Principal,
    profileId: string,
  ): Promise<{
    total: number;
    perCane: Array<{ caneId: string; total: number; updatedAt: string }>;
  }> {
    return this.db.asAccount(toAccountContext(principal), async (tx) => {
      await this.access.requireAccess(tx, profileId);
      const rows = await tx.$queryRaw<
        Array<{ cane_id: string; total: number; updated_at: Date }>
      >`
        SELECT cane_id, total, updated_at
        FROM guardme.false_alarm_counters
        WHERE profile_id = ${profileId}::uuid
        ORDER BY cane_id
      `;
      return {
        total: rows.reduce((sum, row) => sum + row.total, 0),
        perCane: rows.map((row) => ({
          caneId: row.cane_id,
          total: row.total,
          updatedAt: row.updated_at.toISOString(),
        })),
      };
    });
  }

  private async ingestOne(
    principal: Principal,
    installationId: string,
    raw: unknown,
  ): Promise<GatewayEventItemResult> {
    const item = parseItem(raw);
    if (!item.ok) {
      return {
        eventId: item.eventId,
        status: 'rejected',
        code: 'VALIDATION_FAILED',
      };
    }
    const event = item.event;
    const occurredAt = new Date(event.occurredAt);
    const oldest =
      this.clock.now().getTime() -
      this.policy.eventReceiptRetentionDays * 86_400_000;
    if (occurredAt.getTime() < oldest) {
      return {
        eventId: event.eventId,
        status: 'rejected',
        code: 'EVENT_TOO_OLD',
      };
    }
    try {
      return await this.db.asAccount(
        toAccountContext(principal),
        async (tx) => {
          const gateway = await this.resolver.resolveActive(
            tx,
            installationId,
            event.caneId,
          );
          if (event.type === 'false_alarm_canceled') {
            return this.acceptCancellation(
              tx,
              principal,
              installationId,
              event,
              gateway,
              occurredAt,
            );
          }
          await this.acceptTelemetry(tx, installationId, event, gateway);
          return { eventId: event.eventId, status: 'accepted' as const };
        },
      );
    } catch (error) {
      if (
        error instanceof DomainError &&
        error.code === 'FORBIDDEN_ACTION' &&
        error.details.reason === 'not_active_gateway'
      ) {
        return {
          eventId: event.eventId,
          status: 'rejected',
          code: 'NOT_ACTIVE_GATEWAY',
        };
      }
      throw error;
    }
  }

  private async acceptCancellation(
    tx: Tx,
    principal: Principal,
    installationId: string,
    event: GatewayEvent,
    gateway: { profileId: string; caneAssignmentId: string; caneId: string },
    occurredAt: Date,
  ): Promise<GatewayEventItemResult> {
    const incidents = await tx.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT id, status
      FROM guardme.incidents
      WHERE source_key = ${fallSourceKey(event.caneId, event.eventId)}
    `;
    const incident = incidents[0];
    if (incident) {
      // PD-12 pendiente: el hecho tardío no incrementa falsas alarmas ni cierra la incidencia.
      const prior = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM guardme.incident_events
        WHERE incident_id = ${incident.id}::uuid
          AND type = 'late_cancellation_received'
      `;
      if (prior[0]) {
        return { eventId: event.eventId, status: 'duplicate' };
      }
      await this.incidentEvents.append(tx, {
        incidentId: incident.id,
        type: 'late_cancellation_received',
        actorKind: 'installation',
        actorAccountId: principal.accountId,
        actorInstallationId: installationId,
        context: { cancelledVia: event.payload.cancelledVia },
      });
      return { eventId: event.eventId, status: 'accepted' };
    }
    const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO guardme.event_receipts (
        source_key, kind, installation_id, cane_id, cane_assignment_id,
        occurred_at, received_at, detail
      )
      VALUES (
        ${`cancel:${event.caneId}:${event.eventId}`},
        'false_alarm_canceled',
        ${installationId}::uuid,
        ${event.caneId}::uuid,
        ${gateway.caneAssignmentId}::uuid,
        ${occurredAt}::timestamptz,
        ${this.clock.now()}::timestamptz,
        ${event.payload.cancelledVia}
      )
      ON CONFLICT (source_key) DO NOTHING
      RETURNING id
    `;
    if (!inserted[0]) return { eventId: event.eventId, status: 'duplicate' };
    await tx.$executeRaw`
      INSERT INTO guardme.false_alarm_counters (profile_id, cane_id, total, updated_at)
      VALUES (
        ${gateway.profileId}::uuid,
        ${event.caneId}::uuid,
        1,
        ${this.clock.now()}::timestamptz
      )
      ON CONFLICT (profile_id, cane_id) DO UPDATE
      SET total = guardme.false_alarm_counters.total + 1,
          updated_at = EXCLUDED.updated_at
    `;
    return { eventId: event.eventId, status: 'accepted' };
  }

  private async acceptTelemetry(
    tx: Tx,
    installationId: string,
    event: GatewayEvent,
    gateway: { caneAssignmentId: string; caneId: string },
  ): Promise<void> {
    const payload = event.payload;
    const capturedAt = new Date(payload.capturedAt ?? event.occurredAt);
    await tx.$executeRaw`
      INSERT INTO guardme.cane_telemetry_latest (
        cane_assignment_id, cane_id, battery_pct, charging, sensor_status,
        link_status, captured_at, received_at, source_installation_id
      )
      VALUES (
        ${gateway.caneAssignmentId}::uuid,
        ${event.caneId}::uuid,
        ${payload.batteryPct ?? null}::smallint,
        ${payload.charging ?? null},
        ${payload.sensorStatus ?? null},
        ${payload.linkStatus ?? null},
        ${capturedAt}::timestamptz,
        ${this.clock.now()}::timestamptz,
        ${installationId}::uuid
      )
      ON CONFLICT (cane_assignment_id) DO UPDATE
      SET battery_pct = EXCLUDED.battery_pct,
          charging = EXCLUDED.charging,
          sensor_status = EXCLUDED.sensor_status,
          link_status = EXCLUDED.link_status,
          captured_at = EXCLUDED.captured_at,
          received_at = EXCLUDED.received_at,
          source_installation_id = EXCLUDED.source_installation_id,
          cane_id = EXCLUDED.cane_id
      WHERE guardme.cane_telemetry_latest.captured_at < EXCLUDED.captured_at
    `;
    if (payload.firmwareVersion) {
      await tx.$executeRaw`
        UPDATE guardme.canes
        SET firmware_version = ${payload.firmwareVersion}
        WHERE id = ${event.caneId}::uuid
          AND firmware_version IS DISTINCT FROM ${payload.firmwareVersion}
      `;
    }
  }
}

interface FalseAlarmPayload {
  cancelledVia: 'button' | 'app';
}

interface TelemetryPayload {
  batteryPct: number | null;
  charging: boolean | null;
  sensorStatus: 'ok' | 'fault' | 'unknown' | null;
  linkStatus: 'connected' | 'disconnected' | null;
  firmwareVersion?: string;
  capturedAt: string;
}

interface GatewayEvent {
  eventId: string;
  type: 'false_alarm_canceled' | 'telemetry_observed';
  caneId: string;
  occurredAt: string;
  payload: FalseAlarmPayload & TelemetryPayload;
}

function parseItem(
  raw: unknown,
): { ok: true; event: GatewayEvent } | { ok: false; eventId: string } {
  const record = isRecord(raw) ? raw : {};
  const eventId = stringField(record, 'eventId') ?? '';
  const type = stringField(record, 'type');
  const caneId = stringField(record, 'caneId');
  const occurredAt = stringField(record, 'occurredAt');
  const payload = record.payload;
  if (
    !EVENT_ID.test(eventId) ||
    (type !== 'false_alarm_canceled' && type !== 'telemetry_observed') ||
    !caneId ||
    !UUID.test(caneId) ||
    !occurredAt ||
    Number.isNaN(Date.parse(occurredAt)) ||
    !isRecord(payload)
  ) {
    return { ok: false, eventId };
  }
  if (type === 'false_alarm_canceled') {
    const via = stringField(payload, 'cancelledVia');
    if (via !== 'button' && via !== 'app') return { ok: false, eventId };
    return {
      ok: true,
      event: {
        eventId,
        type,
        caneId,
        occurredAt,
        payload: emptyTelemetry(via),
      },
    };
  }
  const battery = payload.batteryPct;
  if (
    battery != null &&
    (typeof battery !== 'number' ||
      !Number.isInteger(battery) ||
      battery < 0 ||
      battery > 100)
  ) {
    return { ok: false, eventId };
  }
  const charging = payload.charging;
  if (charging != null && typeof charging !== 'boolean') {
    return { ok: false, eventId };
  }
  const sensor = stringField(payload, 'sensorStatus');
  if (
    sensor != null &&
    sensor !== 'ok' &&
    sensor !== 'fault' &&
    sensor !== 'unknown'
  ) {
    return { ok: false, eventId };
  }
  const link = stringField(payload, 'linkStatus');
  if (link != null && link !== 'connected' && link !== 'disconnected') {
    return { ok: false, eventId };
  }
  const capturedAt = stringField(payload, 'capturedAt');
  if (!capturedAt || Number.isNaN(Date.parse(capturedAt))) {
    return { ok: false, eventId };
  }
  const firmware = stringField(payload, 'firmwareVersion');
  return {
    ok: true,
    event: {
      eventId,
      type,
      caneId,
      occurredAt,
      payload: {
        cancelledVia: 'button',
        batteryPct: typeof battery === 'number' ? battery : null,
        charging: typeof charging === 'boolean' ? charging : null,
        sensorStatus: sensor ?? null,
        linkStatus: link ?? null,
        firmwareVersion: firmware,
        capturedAt,
      },
    },
  };
}

function emptyTelemetry(
  cancelledVia: 'button' | 'app',
): FalseAlarmPayload & TelemetryPayload {
  return {
    cancelledVia,
    batteryPct: null,
    charging: null,
    sensorStatus: null,
    linkStatus: null,
    capturedAt: '',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringField(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const field = value[key];
  return typeof field === 'string' ? field : undefined;
}
