-- Recibos de pasarela, falsas alarmas, telemetría e incidencias.
-- La API no actualiza ni borra el historial de una incidencia: una corrección es otro evento.

ALTER TABLE guardme.event_receipts ADD CONSTRAINT guardme_event_receipts_kind_check CHECK (kind IN ('false_alarm_canceled', 'telemetry_observed'));


ALTER TABLE guardme.false_alarm_counters ADD CONSTRAINT guardme_false_alarm_counters_total_check CHECK (total >= 0);


ALTER TABLE guardme.cane_telemetry_latest ADD CONSTRAINT guardme_cane_telemetry_latest_battery_pct_check CHECK (battery_pct IS NULL OR battery_pct BETWEEN 0 AND 100);
ALTER TABLE guardme.cane_telemetry_latest ADD CONSTRAINT guardme_cane_telemetry_latest_sensor_status_check CHECK (sensor_status IS NULL OR sensor_status IN ('ok', 'fault', 'unknown'));
ALTER TABLE guardme.cane_telemetry_latest ADD CONSTRAINT guardme_cane_telemetry_latest_link_status_check CHECK (link_status IS NULL OR link_status IN ('connected', 'disconnected'));


ALTER TABLE guardme.incidents ADD CONSTRAINT guardme_incidents_origin_check CHECK (origin IN ('fall_detected', 'manual_emergency'));
ALTER TABLE guardme.incidents ADD CONSTRAINT guardme_incidents_status_check CHECK (status IN (
      'pending_contact',
      'contacting',
      'caregiver_informed',
      'attention_postponed',
      'escalation_required',
      'closed_assisted',
      'delayed_review'
    ));
ALTER TABLE guardme.incidents ADD CONSTRAINT guardme_incidents_escalation_reason_check CHECK (escalation_reason IS NULL
    OR escalation_reason IN (
      'attempts_exhausted',
      'manual_request',
      'caregiver_request',
      'no_contacts'
    ));
ALTER TABLE guardme.incidents ADD CONSTRAINT guardme_incidents_CHECK_check CHECK (origin <> 'fall_detected'
    OR (cane_id IS NOT NULL AND cane_assignment_id IS NOT NULL));


CREATE TRIGGER incidents_bump_version
  BEFORE UPDATE ON guardme.incidents
  FOR EACH ROW
  EXECUTE FUNCTION guardme.bump_version();

-- (prisma) skip incidents_profile_occurred_idx


CREATE INDEX incidents_open_status_idx
  ON guardme.incidents (status)
  WHERE status NOT IN ('closed_assisted');

ALTER TABLE guardme.incident_events ADD CONSTRAINT guardme_incident_events_type_check CHECK (type IN (
      'activated',
      'delayed_registered',
      'notification_scheduled',
      'late_cancellation_received',
      'call_plan_created',
      'call_attempt_requested',
      'call_attempt_result',
      'transport_answered',
      'caregiver_informed',
      'decision_take_charge',
      'decision_postpone',
      'decision_request_emergency',
      'escalation_required',
      'closed_assisted',
      'followup_created',
      'postpone_reminder_sent',
      'postpone_collective_sent'
    ));
ALTER TABLE guardme.incident_events ADD CONSTRAINT guardme_incident_events_actor_kind_check CHECK (actor_kind IN ('account', 'installation', 'system', 'provider'));


-- (prisma) skip incident_events_incident_idx


REVOKE ALL ON TABLE
  guardme.event_receipts,
  guardme.false_alarm_counters,
  guardme.cane_telemetry_latest,
  guardme.incidents,
  guardme.incident_events
FROM PUBLIC;

GRANT SELECT, INSERT ON TABLE guardme.event_receipts TO guardme_api;
GRANT SELECT, DELETE ON TABLE guardme.event_receipts TO guardme_worker;

GRANT SELECT, INSERT, UPDATE ON TABLE guardme.false_alarm_counters TO guardme_api;
GRANT SELECT ON TABLE guardme.false_alarm_counters TO guardme_worker;

GRANT SELECT, INSERT, UPDATE ON TABLE guardme.cane_telemetry_latest TO guardme_api;
GRANT SELECT ON TABLE guardme.cane_telemetry_latest TO guardme_worker, guardme_onboarding;

GRANT SELECT, INSERT ON TABLE guardme.incidents TO guardme_api;
GRANT UPDATE (status, escalation_reason, closed_at, closed_by_account_id)
  ON TABLE guardme.incidents TO guardme_api, guardme_worker;
GRANT SELECT ON TABLE guardme.incidents TO guardme_worker;

GRANT SELECT, INSERT ON TABLE guardme.incident_events TO guardme_api, guardme_worker;

GRANT UPDATE (last_event_at) ON TABLE guardme.gateways TO guardme_api;
GRANT UPDATE (firmware_version) ON TABLE guardme.canes TO guardme_api;

ALTER TABLE guardme.event_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.false_alarm_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.cane_telemetry_latest ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.incident_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_receipts_api ON guardme.event_receipts
  FOR ALL TO guardme_api
  USING (installation_id = guardme.ctx_installation_id())
  WITH CHECK (installation_id = guardme.ctx_installation_id());

CREATE POLICY event_receipts_worker_select ON guardme.event_receipts
  FOR SELECT TO guardme_worker
  USING (true);

CREATE POLICY event_receipts_worker_delete ON guardme.event_receipts
  FOR DELETE TO guardme_worker
  USING (true);

CREATE POLICY false_alarm_counters_api ON guardme.false_alarm_counters
  FOR ALL TO guardme_api
  USING (guardme.has_profile_access(profile_id))
  WITH CHECK (guardme.has_profile_access(profile_id));

CREATE POLICY false_alarm_counters_worker_select ON guardme.false_alarm_counters
  FOR SELECT TO guardme_worker
  USING (true);

CREATE POLICY cane_telemetry_api ON guardme.cane_telemetry_latest
  FOR ALL TO guardme_api
  USING (
    EXISTS (
      SELECT 1
      FROM guardme.cane_assignments AS a
      WHERE a.id = cane_telemetry_latest.cane_assignment_id
        AND guardme.has_profile_access(a.profile_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM guardme.cane_assignments AS a
      WHERE a.id = cane_telemetry_latest.cane_assignment_id
        AND guardme.has_profile_access(a.profile_id)
    )
  );

CREATE POLICY cane_telemetry_worker_select ON guardme.cane_telemetry_latest
  FOR SELECT TO guardme_worker
  USING (true);

CREATE POLICY incidents_api_select ON guardme.incidents
  FOR SELECT TO guardme_api
  USING (guardme.has_profile_access(profile_id));

CREATE POLICY incidents_api_insert ON guardme.incidents
  FOR INSERT TO guardme_api
  WITH CHECK (guardme.has_profile_access(profile_id));

CREATE POLICY incidents_api_update ON guardme.incidents
  FOR UPDATE TO guardme_api
  USING (guardme.has_profile_access(profile_id))
  WITH CHECK (guardme.has_profile_access(profile_id));

CREATE POLICY incidents_worker_select ON guardme.incidents
  FOR SELECT TO guardme_worker
  USING (true);

CREATE POLICY incidents_worker_update ON guardme.incidents
  FOR UPDATE TO guardme_worker
  USING (true)
  WITH CHECK (true);

CREATE POLICY incident_events_api ON guardme.incident_events
  FOR ALL TO guardme_api
  USING (
    EXISTS (
      SELECT 1
      FROM guardme.incidents AS i
      WHERE i.id = incident_events.incident_id
        AND guardme.has_profile_access(i.profile_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM guardme.incidents AS i
      WHERE i.id = incident_events.incident_id
        AND guardme.has_profile_access(i.profile_id)
    )
  );

CREATE POLICY incident_events_worker ON guardme.incident_events
  FOR ALL TO guardme_worker
  USING (true)
  WITH CHECK (true);

CREATE POLICY canes_api_update ON guardme.canes
  FOR UPDATE TO guardme_api
  USING (
    EXISTS (
      SELECT 1
      FROM guardme.cane_assignments AS a
      WHERE a.cane_id = canes.id
        AND a.ended_at IS NULL
        AND guardme.has_profile_access(a.profile_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM guardme.cane_assignments AS a
      WHERE a.cane_id = canes.id
        AND a.ended_at IS NULL
        AND guardme.has_profile_access(a.profile_id)
    )
  );
