-- Bastones, asignaciones, pasarela única y contactos prioritarios.
-- onboarding también cierra asignaciones: claim/release corren en una sola transacción de ese rol.
-- contacts_version ya vive en profiles desde 00000_init (Prisma schema).

ALTER TABLE guardme.canes ADD CONSTRAINT guardme_canes_status_check CHECK (status IN ('available', 'assigned', 'retired'));


CREATE TRIGGER canes_bump_version
  BEFORE UPDATE ON guardme.canes
  FOR EACH ROW
  EXECUTE FUNCTION guardme.bump_version();



CREATE UNIQUE INDEX cane_assignments_active_idx
  ON guardme.cane_assignments (cane_id)
  WHERE ended_at IS NULL;

ALTER TABLE guardme.gateways ADD CONSTRAINT guardme_gateways_end_reason_check CHECK (end_reason IS NULL
    OR end_reason IN ('replaced', 'installation_revoked', 'access_revoked', 'cane_released'));


CREATE UNIQUE INDEX gateways_active_idx
  ON guardme.gateways (cane_id)
  WHERE ended_at IS NULL;

ALTER TABLE guardme.contacts ADD CONSTRAINT guardme_contacts_display_name_check CHECK (char_length(display_name) BETWEEN 1 AND 80);
ALTER TABLE guardme.contacts ADD CONSTRAINT guardme_contacts_priority_check CHECK (priority IS NULL OR priority IN (1, 2));
ALTER TABLE guardme.contacts ADD CONSTRAINT guardme_contacts_status_check CHECK (status IN ('active', 'removed'));


CREATE TRIGGER contacts_bump_version
  BEFORE UPDATE ON guardme.contacts
  FOR EACH ROW
  EXECUTE FUNCTION guardme.bump_version();

CREATE UNIQUE INDEX contacts_active_priority_idx
  ON guardme.contacts (profile_id, priority)
  WHERE status = 'active' AND priority IS NOT NULL;

REVOKE ALL ON TABLE guardme.canes, guardme.cane_assignments, guardme.gateways, guardme.contacts FROM PUBLIC;

GRANT SELECT ON TABLE guardme.canes TO guardme_api, guardme_worker;
GRANT SELECT, UPDATE (status) ON TABLE guardme.canes TO guardme_onboarding;
GRANT UPDATE (firmware_version) ON TABLE guardme.canes TO guardme_worker;

GRANT SELECT ON TABLE guardme.cane_assignments TO guardme_api, guardme_onboarding, guardme_worker;
GRANT UPDATE (ended_at, ended_by_account_id) ON TABLE guardme.cane_assignments TO guardme_api, guardme_onboarding;
GRANT INSERT ON TABLE guardme.cane_assignments TO guardme_onboarding;

GRANT SELECT ON TABLE guardme.gateways TO guardme_api, guardme_onboarding, guardme_worker;
GRANT INSERT ON TABLE guardme.gateways TO guardme_api;
GRANT UPDATE (ended_at, end_reason) ON TABLE guardme.gateways TO guardme_api, guardme_onboarding;
GRANT UPDATE (last_event_at) ON TABLE guardme.gateways TO guardme_worker;

GRANT SELECT, INSERT, UPDATE ON TABLE guardme.contacts TO guardme_api;
GRANT SELECT ON TABLE guardme.contacts TO guardme_worker;

ALTER TABLE guardme.canes ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.cane_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.gateways ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY canes_api_select ON guardme.canes
  FOR SELECT TO guardme_api
  USING (
    EXISTS (
      SELECT 1
      FROM guardme.cane_assignments AS a
      WHERE a.cane_id = canes.id
        AND a.ended_at IS NULL
        AND guardme.has_profile_access(a.profile_id)
    )
  );

CREATE POLICY canes_onboarding_all ON guardme.canes
  FOR ALL TO guardme_onboarding
  USING (true)
  WITH CHECK (true);

CREATE POLICY canes_worker_select ON guardme.canes
  FOR SELECT TO guardme_worker
  USING (true);

CREATE POLICY canes_worker_firmware ON guardme.canes
  FOR UPDATE TO guardme_worker
  USING (true)
  WITH CHECK (true);

CREATE POLICY assignments_api_select ON guardme.cane_assignments
  FOR SELECT TO guardme_api
  USING (guardme.has_profile_access(profile_id));

CREATE POLICY assignments_api_update ON guardme.cane_assignments
  FOR UPDATE TO guardme_api
  USING (guardme.has_profile_access(profile_id))
  WITH CHECK (guardme.has_profile_access(profile_id));

CREATE POLICY assignments_onboarding_all ON guardme.cane_assignments
  FOR ALL TO guardme_onboarding
  USING (true)
  WITH CHECK (true);

CREATE POLICY assignments_worker_select ON guardme.cane_assignments
  FOR SELECT TO guardme_worker
  USING (true);

CREATE POLICY gateways_api_select ON guardme.gateways
  FOR SELECT TO guardme_api
  USING (
    EXISTS (
      SELECT 1
      FROM guardme.cane_assignments AS a
      WHERE a.id = gateways.cane_assignment_id
        AND guardme.has_profile_access(a.profile_id)
    )
  );

CREATE POLICY gateways_api_insert ON guardme.gateways
  FOR INSERT TO guardme_api
  WITH CHECK (
    installation_id = guardme.ctx_installation_id()
    AND EXISTS (
      SELECT 1
      FROM guardme.cane_assignments AS a
      WHERE a.id = gateways.cane_assignment_id
        AND guardme.has_profile_access(a.profile_id)
    )
  );

CREATE POLICY gateways_api_update ON guardme.gateways
  FOR UPDATE TO guardme_api
  USING (
    EXISTS (
      SELECT 1
      FROM guardme.cane_assignments AS a
      WHERE a.id = gateways.cane_assignment_id
        AND guardme.has_profile_access(a.profile_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM guardme.cane_assignments AS a
      WHERE a.id = gateways.cane_assignment_id
        AND guardme.has_profile_access(a.profile_id)
    )
  );

CREATE POLICY gateways_onboarding_all ON guardme.gateways
  FOR ALL TO guardme_onboarding
  USING (true)
  WITH CHECK (true);

CREATE POLICY gateways_worker_select ON guardme.gateways
  FOR SELECT TO guardme_worker
  USING (true);

CREATE POLICY gateways_worker_event ON guardme.gateways
  FOR UPDATE TO guardme_worker
  USING (true)
  WITH CHECK (true);

CREATE POLICY contacts_api_all ON guardme.contacts
  FOR ALL TO guardme_api
  USING (guardme.has_profile_access(profile_id))
  WITH CHECK (guardme.has_profile_access(profile_id));

CREATE POLICY contacts_worker_select ON guardme.contacts
  FOR SELECT TO guardme_worker
  USING (true);
