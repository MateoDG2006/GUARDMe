-- Ubicación opcional. La lectura de la última posición no basta con tener acceso al perfil.



CREATE UNIQUE INDEX location_consents_one_active
  ON guardme.location_consents (profile_id)
  WHERE revoked_at IS NULL;

CREATE TRIGGER location_consents_bump_version
  BEFORE UPDATE ON guardme.location_consents
  FOR EACH ROW
  EXECUTE FUNCTION guardme.bump_version();



CREATE UNIQUE INDEX location_read_grants_one_active
  ON guardme.location_read_grants (consent_id, account_id)
  WHERE revoked_at IS NULL;

ALTER TABLE guardme.location_latest ADD CONSTRAINT guardme_location_latest_lat_check CHECK (lat BETWEEN -90 AND 90);
ALTER TABLE guardme.location_latest ADD CONSTRAINT guardme_location_latest_lng_check CHECK (lng BETWEEN -180 AND 180);
ALTER TABLE guardme.location_latest ADD CONSTRAINT guardme_location_latest_accuracy_m_check CHECK (accuracy_m > 0);


CREATE OR REPLACE FUNCTION guardme.can_read_location(p_profile uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM guardme.location_consents AS c
    JOIN guardme.location_read_grants AS g ON g.consent_id = c.id
    WHERE c.profile_id = p_profile
      AND c.revoked_at IS NULL
      AND g.account_id = guardme.ctx_account_id()
      AND g.revoked_at IS NULL
      AND guardme.has_profile_access(p_profile)
  );
$$;

REVOKE ALL ON FUNCTION guardme.can_read_location(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION guardme.can_read_location(uuid) TO guardme_api;

REVOKE ALL ON TABLE
  guardme.location_consents,
  guardme.location_read_grants,
  guardme.location_latest
FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE ON TABLE
  guardme.location_consents,
  guardme.location_read_grants,
  guardme.location_latest
TO guardme_api;

GRANT DELETE ON TABLE guardme.location_latest TO guardme_api;

ALTER TABLE guardme.location_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.location_read_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.location_latest ENABLE ROW LEVEL SECURITY;

CREATE POLICY location_consents_api ON guardme.location_consents
  FOR ALL TO guardme_api
  USING (guardme.has_profile_access(profile_id))
  WITH CHECK (guardme.has_profile_access(profile_id));

CREATE POLICY location_read_grants_api ON guardme.location_read_grants
  FOR ALL TO guardme_api
  USING (
    EXISTS (
      SELECT 1 FROM guardme.location_consents AS c
      WHERE c.id = location_read_grants.consent_id
        AND guardme.has_profile_access(c.profile_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM guardme.location_consents AS c
      WHERE c.id = location_read_grants.consent_id
        AND guardme.has_profile_access(c.profile_id)
    )
  );

CREATE POLICY location_latest_api_select ON guardme.location_latest
  FOR SELECT TO guardme_api
  USING (
    guardme.profile_relation(profile_id) = 'user'
    OR guardme.can_read_location(profile_id)
  );

CREATE POLICY location_latest_api_write ON guardme.location_latest
  FOR INSERT TO guardme_api
  WITH CHECK (guardme.has_profile_access(profile_id));

CREATE POLICY location_latest_api_update ON guardme.location_latest
  FOR UPDATE TO guardme_api
  USING (guardme.has_profile_access(profile_id))
  WITH CHECK (guardme.has_profile_access(profile_id));

CREATE POLICY location_latest_api_delete ON guardme.location_latest
  FOR DELETE TO guardme_api
  USING (guardme.has_profile_access(profile_id));
