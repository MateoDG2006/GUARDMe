-- Tablas transversales. La API inserta efectos y auditoría; no los lee.
-- El worker descarta lo obsoleto al ejecutar, así que la API no tiene UPDATE ni DELETE.

ALTER TABLE guardme.pending_actions ADD CONSTRAINT guardme_pending_actions_status_check CHECK (status IN ('scheduled', 'dispatched', 'running', 'done', 'discarded', 'failed'));


-- (prisma) skip pending_actions_status_run_at_idx

-- (prisma) skip pending_actions_resource_idx


ALTER TABLE guardme.idempotency_keys ADD CONSTRAINT guardme_idempotency_keys_key_check CHECK (char_length(key) <= 100);


ALTER TABLE guardme.audit_log ADD CONSTRAINT guardme_audit_log_actor_kind_check CHECK (actor_kind IN ('account', 'installation', 'system', 'provider'));
ALTER TABLE guardme.audit_log ADD CONSTRAINT guardme_audit_log_result_check CHECK (result IN ('ok', 'denied', 'failed'));


REVOKE ALL ON TABLE guardme.pending_actions, guardme.idempotency_keys, guardme.audit_log FROM PUBLIC;

GRANT INSERT ON TABLE guardme.pending_actions TO guardme_api, guardme_onboarding;
GRANT SELECT, UPDATE ON TABLE guardme.pending_actions TO guardme_worker;

GRANT INSERT, SELECT ON TABLE guardme.idempotency_keys TO guardme_api;
GRANT DELETE ON TABLE guardme.idempotency_keys TO guardme_worker;

GRANT INSERT ON TABLE guardme.audit_log TO guardme_api, guardme_onboarding, guardme_worker;

ALTER TABLE guardme.pending_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY pending_actions_api_insert ON guardme.pending_actions
  FOR INSERT TO guardme_api
  WITH CHECK (true);

CREATE POLICY pending_actions_onboarding_insert ON guardme.pending_actions
  FOR INSERT TO guardme_onboarding
  WITH CHECK (true);

CREATE POLICY pending_actions_worker_select ON guardme.pending_actions
  FOR SELECT TO guardme_worker
  USING (true);

CREATE POLICY pending_actions_worker_update ON guardme.pending_actions
  FOR UPDATE TO guardme_worker
  USING (true)
  WITH CHECK (true);

CREATE POLICY idempotency_keys_api ON guardme.idempotency_keys
  FOR ALL TO guardme_api
  USING (account_id = guardme.ctx_account_id())
  WITH CHECK (account_id = guardme.ctx_account_id());

-- Sin esta política el GRANT DELETE no tiene efecto: RLS niega por defecto.
CREATE POLICY idempotency_keys_worker_delete ON guardme.idempotency_keys
  FOR DELETE TO guardme_worker
  USING (true);

CREATE POLICY audit_log_api_insert ON guardme.audit_log
  FOR INSERT TO guardme_api
  WITH CHECK (true);

CREATE POLICY audit_log_onboarding_insert ON guardme.audit_log
  FOR INSERT TO guardme_onboarding
  WITH CHECK (true);

CREATE POLICY audit_log_worker_insert ON guardme.audit_log
  FOR INSERT TO guardme_worker
  WITH CHECK (true);

-- ON CONFLICT exige que la fila sea visible para el rol. La API no tiene SELECT;
-- esta función corre como dueño de la tabla y no devuelve la fila.
CREATE OR REPLACE FUNCTION guardme.enqueue_pending_action(
  p_type text,
  p_resource_type text,
  p_resource_id uuid,
  p_dedupe_key text,
  p_payload jsonb,
  p_run_at timestamptz,
  p_max_attempts int
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = guardme, pg_catalog
AS $$
  INSERT INTO guardme.pending_actions (
    type, resource_type, resource_id, dedupe_key, payload, run_at, max_attempts
  ) VALUES (
    p_type, p_resource_type, p_resource_id, p_dedupe_key, p_payload, p_run_at, p_max_attempts
  )
  ON CONFLICT (dedupe_key) DO NOTHING;
$$;

REVOKE ALL ON FUNCTION guardme.enqueue_pending_action(text, text, uuid, text, jsonb, timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION guardme.enqueue_pending_action(text, text, uuid, text, jsonb, timestamptz, int) TO guardme_api, guardme_onboarding;
