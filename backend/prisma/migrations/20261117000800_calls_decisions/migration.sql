-- Plan de llamadas, eventos de proveedor y decisiones del cuidador.
-- ON CONFLICT de provider_events exige ver la fila. El webhook no tiene SELECT;
-- record_provider_event corre como dueño y solo devuelve si insertó.

GRANT USAGE ON SCHEMA guardme TO guardme_ingest;

ALTER TABLE guardme.call_plans ADD CONSTRAINT guardme_call_plans_status_check CHECK (status IN ('active', 'stopped', 'exhausted'));
ALTER TABLE guardme.call_plans ADD CONSTRAINT guardme_call_plans_stopped_reason_check CHECK (stopped_reason IS NULL OR stopped_reason IN ('caregiver_decision', 'human_confirmed'));


ALTER TABLE guardme.call_attempts ADD CONSTRAINT guardme_call_attempts_ordinal_check CHECK (ordinal BETWEEN 1 AND 4);
ALTER TABLE guardme.call_attempts ADD CONSTRAINT guardme_call_attempts_status_check CHECK (status IN (
      'planned', 'requesting', 'ringing', 'answered_transport', 'human_confirmed',
      'answered_unconfirmed', 'no_answer', 'busy', 'failed', 'canceled',
      'uncertain', 'skipped'
    ));


CREATE UNIQUE INDEX call_attempts_one_active_idx
  ON guardme.call_attempts (incident_id)
  WHERE status IN ('requesting', 'ringing', 'answered_transport', 'uncertain');

CREATE UNIQUE INDEX call_attempts_provider_ref_idx
  ON guardme.call_attempts (provider, provider_ref)
  WHERE provider_ref IS NOT NULL;

CREATE TRIGGER call_attempts_bump_version
  BEFORE UPDATE ON guardme.call_attempts
  FOR EACH ROW
  EXECUTE FUNCTION guardme.bump_version();

ALTER TABLE guardme.provider_events ADD CONSTRAINT guardme_provider_events_apply_result_check CHECK (apply_result IS NULL OR apply_result IN (
      'applied', 'ignored_older', 'ignored_closed', 'unmatched'
    ));


ALTER TABLE guardme.caregiver_decisions ADD CONSTRAINT guardme_caregiver_decisions_option_check CHECK (option IN ('take_charge', 'postpone', 'request_emergency'));


CREATE UNIQUE INDEX caregiver_decisions_one_take_charge_idx
  ON guardme.caregiver_decisions (incident_id)
  WHERE option = 'take_charge';

ALTER TABLE guardme.incident_events DROP CONSTRAINT guardme_incident_events_type_check;
ALTER TABLE guardme.incident_events ADD CONSTRAINT guardme_incident_events_type_check CHECK (
  type IN (
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
    'postpone_collective_sent',
    'emergency_dialer_opened',
    'call_attempt_skipped',
    'human_confirm_timeout',
    'late_transport_answer',
    'call_plan_stopped',
    'call_plan_exhausted'
  )
);

REVOKE ALL ON TABLE
  guardme.call_plans,
  guardme.call_attempts,
  guardme.provider_events,
  guardme.caregiver_decisions
FROM PUBLIC;

GRANT SELECT, INSERT ON TABLE guardme.call_plans TO guardme_api;
GRANT UPDATE (status, stopped_reason) ON TABLE guardme.call_plans TO guardme_api;
GRANT SELECT, UPDATE ON TABLE guardme.call_plans TO guardme_worker;

GRANT SELECT, INSERT ON TABLE guardme.call_attempts TO guardme_api;
GRANT UPDATE (status, status_reason, ended_at) ON TABLE guardme.call_attempts TO guardme_api;
GRANT SELECT, UPDATE ON TABLE guardme.call_attempts TO guardme_worker;

GRANT SELECT, INSERT ON TABLE guardme.provider_events TO guardme_worker;
GRANT UPDATE (applied_at, apply_result) ON TABLE guardme.provider_events TO guardme_worker;
GRANT INSERT ON TABLE guardme.provider_events TO guardme_ingest;

GRANT SELECT, INSERT ON TABLE guardme.caregiver_decisions TO guardme_api;
GRANT SELECT ON TABLE guardme.caregiver_decisions TO guardme_worker;

GRANT INSERT ON TABLE guardme.pending_actions TO guardme_ingest;

ALTER TABLE guardme.call_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.call_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.caregiver_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY call_plans_api ON guardme.call_plans
  FOR ALL TO guardme_api
  USING (
    EXISTS (
      SELECT 1 FROM guardme.incidents i
      WHERE i.id = call_plans.incident_id
        AND guardme.has_profile_access(i.profile_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM guardme.incidents i
      WHERE i.id = call_plans.incident_id
        AND guardme.has_profile_access(i.profile_id)
    )
  );

CREATE POLICY call_plans_worker ON guardme.call_plans
  FOR ALL TO guardme_worker
  USING (true)
  WITH CHECK (true);

CREATE POLICY call_attempts_api ON guardme.call_attempts
  FOR ALL TO guardme_api
  USING (
    EXISTS (
      SELECT 1 FROM guardme.incidents i
      WHERE i.id = call_attempts.incident_id
        AND guardme.has_profile_access(i.profile_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM guardme.incidents i
      WHERE i.id = call_attempts.incident_id
        AND guardme.has_profile_access(i.profile_id)
    )
  );

CREATE POLICY call_attempts_worker ON guardme.call_attempts
  FOR ALL TO guardme_worker
  USING (true)
  WITH CHECK (true);

CREATE POLICY provider_events_worker ON guardme.provider_events
  FOR ALL TO guardme_worker
  USING (true)
  WITH CHECK (true);

CREATE POLICY provider_events_ingest_insert ON guardme.provider_events
  FOR INSERT TO guardme_ingest
  WITH CHECK (true);

CREATE POLICY caregiver_decisions_api ON guardme.caregiver_decisions
  FOR ALL TO guardme_api
  USING (
    EXISTS (
      SELECT 1 FROM guardme.incidents i
      WHERE i.id = caregiver_decisions.incident_id
        AND guardme.has_profile_access(i.profile_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM guardme.incidents i
      WHERE i.id = caregiver_decisions.incident_id
        AND guardme.has_profile_access(i.profile_id)
    )
  );

CREATE POLICY caregiver_decisions_worker ON guardme.caregiver_decisions
  FOR SELECT TO guardme_worker
  USING (true);

CREATE POLICY pending_actions_ingest_insert ON guardme.pending_actions
  FOR INSERT TO guardme_ingest
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION guardme.record_provider_event(
  p_provider text,
  p_event_key text,
  p_provider_ref text,
  p_status text,
  p_sequence int,
  p_provider_timestamp timestamptz
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = guardme, pg_catalog
AS $$
DECLARE
  inserted_id uuid;
BEGIN
  INSERT INTO guardme.provider_events (
    provider, event_key, provider_ref, status, sequence, provider_timestamp
  ) VALUES (
    p_provider, p_event_key, p_provider_ref, p_status, p_sequence, p_provider_timestamp
  )
  ON CONFLICT (provider, event_key) DO NOTHING
  RETURNING id INTO inserted_id;
  RETURN inserted_id;
END;
$$;

REVOKE ALL ON FUNCTION guardme.record_provider_event(text, text, text, text, int, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION guardme.record_provider_event(text, text, text, text, int, timestamptz) TO guardme_ingest;
GRANT EXECUTE ON FUNCTION guardme.enqueue_pending_action(text, text, uuid, text, jsonb, timestamptz, int) TO guardme_ingest;
