-- Cuentas de dominio e instalaciones. identity.users no se borra en cascada:
-- la política de borrado/anonimización se define antes del piloto; RESTRICT evita cascadas.

ALTER TABLE guardme.accounts ADD CONSTRAINT guardme_accounts_display_name_check CHECK (char_length(display_name) <= 80);
ALTER TABLE guardme.accounts ADD CONSTRAINT guardme_accounts_onboarding_kind_check CHECK (onboarding_kind IN ('self', 'caregiver', 'supervised'));
ALTER TABLE guardme.accounts ADD CONSTRAINT guardme_accounts_status_check CHECK (status IN ('active', 'blocked', 'anonymized'));


CREATE TRIGGER accounts_bump_version
  BEFORE UPDATE ON guardme.accounts
  FOR EACH ROW
  EXECUTE FUNCTION guardme.bump_version();

ALTER TABLE guardme.installations ADD CONSTRAINT guardme_installations_platform_check CHECK (platform IN ('android'));
ALTER TABLE guardme.installations ADD CONSTRAINT guardme_installations_status_check CHECK (status IN ('active', 'revoked'));
ALTER TABLE guardme.installations ADD CONSTRAINT guardme_installations_revoke_reason_check CHECK (revoke_reason IS NULL
    OR revoke_reason IN ('logout', 'logout_all', 'user_revoked', 'replaced', 'invalid_push_token'));


CREATE UNIQUE INDEX installations_active_client_idx
  ON guardme.installations (account_id, client_installation_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX installations_active_push_token_idx
  ON guardme.installations (push_token)
  WHERE status = 'active' AND push_token IS NOT NULL;

CREATE OR REPLACE FUNCTION guardme.resolve_principal(
  p_auth_user_id uuid,
  p_installation_id uuid
) RETURNS TABLE (
  account_id uuid,
  account_status text,
  installation_account_id uuid,
  installation_status text,
  installation_session_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    a.id,
    a.status,
    i.account_id,
    i.status,
    i.auth_session_id
  FROM (SELECT 1) AS anchor
  LEFT JOIN guardme.accounts AS a ON a.auth_user_id = p_auth_user_id
  LEFT JOIN guardme.installations AS i ON i.id = p_installation_id;
$$;

REVOKE ALL ON FUNCTION guardme.resolve_principal(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION guardme.resolve_principal(uuid, uuid) TO guardme_api;

REVOKE ALL ON TABLE guardme.accounts, guardme.installations FROM PUBLIC;

GRANT SELECT ON TABLE guardme.accounts TO guardme_api, guardme_worker;
GRANT UPDATE (display_name) ON TABLE guardme.accounts TO guardme_api;
GRANT SELECT, INSERT, UPDATE ON TABLE guardme.accounts TO guardme_onboarding;

GRANT SELECT ON TABLE guardme.installations TO guardme_api, guardme_worker;
GRANT UPDATE (status, revoked_at, revoke_reason, last_seen_at)
  ON TABLE guardme.installations TO guardme_api;
GRANT SELECT, INSERT, UPDATE ON TABLE guardme.installations TO guardme_onboarding;
GRANT UPDATE (push_token, status, revoked_at, revoke_reason)
  ON TABLE guardme.installations TO guardme_worker;

ALTER TABLE guardme.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounts_api_select ON guardme.accounts
  FOR SELECT TO guardme_api
  USING (id = guardme.ctx_account_id());

CREATE POLICY accounts_api_update ON guardme.accounts
  FOR UPDATE TO guardme_api
  USING (id = guardme.ctx_account_id())
  WITH CHECK (id = guardme.ctx_account_id());

CREATE POLICY accounts_onboarding_all ON guardme.accounts
  FOR ALL TO guardme_onboarding
  USING (true)
  WITH CHECK (true);

CREATE POLICY accounts_worker_select ON guardme.accounts
  FOR SELECT TO guardme_worker
  USING (true);

CREATE POLICY installations_api_select ON guardme.installations
  FOR SELECT TO guardme_api
  USING (account_id = guardme.ctx_account_id());

CREATE POLICY installations_api_update ON guardme.installations
  FOR UPDATE TO guardme_api
  USING (account_id = guardme.ctx_account_id())
  WITH CHECK (account_id = guardme.ctx_account_id());

CREATE POLICY installations_onboarding_all ON guardme.installations
  FOR ALL TO guardme_onboarding
  USING (true)
  WITH CHECK (true);

CREATE POLICY installations_worker_select ON guardme.installations
  FOR SELECT TO guardme_worker
  USING (true);

CREATE POLICY installations_worker_update ON guardme.installations
  FOR UPDATE TO guardme_worker
  USING (true)
  WITH CHECK (true);
