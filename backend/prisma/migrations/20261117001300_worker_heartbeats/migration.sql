-- Latido del worker y agregados que la API puede leer sin ver filas ajenas.



REVOKE ALL ON TABLE guardme.worker_heartbeats FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE guardme.worker_heartbeats TO guardme_worker;
GRANT SELECT ON TABLE guardme.worker_heartbeats TO guardme_api;

ALTER TABLE guardme.worker_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY worker_heartbeats_worker ON guardme.worker_heartbeats
  FOR ALL TO guardme_worker
  USING (true)
  WITH CHECK (true);

CREATE POLICY worker_heartbeats_api_select ON guardme.worker_heartbeats
  FOR SELECT TO guardme_api
  USING (true);

CREATE OR REPLACE FUNCTION guardme.health_snapshot()
RETURNS TABLE (
  worker_last_beat_age_sec int,
  oldest_due_action_age_sec int,
  failed_actions_last_24h int,
  deliveries_failed_last_1h int,
  deliveries_last_1h int,
  uncertain_call_attempts int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COALESCE(
      (
        SELECT EXTRACT(EPOCH FROM (now() - max(last_beat_at)))::int
        FROM guardme.worker_heartbeats
      ),
      999999
    ),
    COALESCE(
      (
        SELECT EXTRACT(EPOCH FROM (now() - min(run_at)))::int
        FROM guardme.pending_actions
        WHERE status = 'scheduled'
          AND run_at < now()
      ),
      0
    ),
    (
      SELECT count(*)::int
      FROM guardme.pending_actions
      WHERE status = 'failed'
        AND updated_at > now() - interval '24 hours'
    ),
    (
      SELECT count(*)::int
      FROM guardme.notification_deliveries AS d
      JOIN guardme.notifications AS n ON n.id = d.notification_id
      WHERE d.status IN ('failed', 'token_invalid')
        AND n.created_at > now() - interval '1 hour'
    ),
    (
      SELECT count(*)::int
      FROM guardme.notification_deliveries AS d
      JOIN guardme.notifications AS n ON n.id = d.notification_id
      WHERE n.created_at > now() - interval '1 hour'
    ),
    (
      SELECT count(*)::int
      FROM guardme.call_attempts
      WHERE status = 'uncertain'
    );
$$;

REVOKE ALL ON FUNCTION guardme.health_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION guardme.health_snapshot() TO guardme_api;
