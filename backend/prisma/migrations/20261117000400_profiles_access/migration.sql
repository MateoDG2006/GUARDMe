-- Perfiles asistidos, accesos, invitaciones e incorporación supervisada.

ALTER TABLE guardme.profiles ADD CONSTRAINT guardme_profiles_display_name_check CHECK (char_length(display_name) BETWEEN 1 AND 80);
ALTER TABLE guardme.profiles ADD CONSTRAINT guardme_profiles_status_check CHECK (status IN ('active', 'archived'));


CREATE TRIGGER profiles_bump_version
  BEFORE UPDATE ON guardme.profiles
  FOR EACH ROW
  EXECUTE FUNCTION guardme.bump_version();

ALTER TABLE guardme.profile_access ADD CONSTRAINT guardme_profile_access_relation_check CHECK (relation IN ('user', 'caregiver'));
ALTER TABLE guardme.profile_access ADD CONSTRAINT guardme_profile_access_caregiver_category_check CHECK (caregiver_category IN ('family', 'medical'));
ALTER TABLE guardme.profile_access ADD CONSTRAINT guardme_profile_access_status_check CHECK (status IN ('active', 'revoked'));
ALTER TABLE guardme.profile_access ADD CONSTRAINT guardme_profile_access_granted_via_check CHECK (granted_via IN ('profile_creation', 'invitation', 'enrollment'));
ALTER TABLE guardme.profile_access ADD CONSTRAINT profile_access_category_ck CHECK ((relation = 'caregiver') = (caregiver_category IS NOT NULL));


CREATE TRIGGER profile_access_bump_version
  BEFORE UPDATE ON guardme.profile_access
  FOR EACH ROW
  EXECUTE FUNCTION guardme.bump_version();

CREATE UNIQUE INDEX profile_access_active_pair_idx
  ON guardme.profile_access (account_id, profile_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX profile_access_active_user_idx
  ON guardme.profile_access (profile_id)
  WHERE relation = 'user' AND status = 'active';

CREATE INDEX profile_access_active_account_idx
  ON guardme.profile_access (account_id)
  WHERE status = 'active';

ALTER TABLE guardme.invitations ADD CONSTRAINT guardme_invitations_status_check CHECK (status IN ('pending', 'accepted', 'withdrawn', 'expired', 'rejected'));


ALTER TABLE guardme.supervised_enrollments ADD CONSTRAINT guardme_supervised_enrollments_purpose_check CHECK (purpose IN ('initial', 'replace_user'));
ALTER TABLE guardme.supervised_enrollments ADD CONSTRAINT guardme_supervised_enrollments_status_check CHECK (status IN ('pending', 'consumed', 'withdrawn', 'expired'));


ALTER TABLE guardme.onboarding_steps ADD CONSTRAINT guardme_onboarding_steps_step_check CHECK (step IN ('intent_selected', 'pin_set', 'permissions_granted', 'end_to_end_test'));
ALTER TABLE guardme.onboarding_steps ADD CONSTRAINT guardme_onboarding_steps_status_check CHECK (status IN ('done', 'blocked', 'skipped'));
ALTER TABLE guardme.onboarding_steps ADD CONSTRAINT guardme_onboarding_steps_reason_check CHECK (reason IS NULL
    OR reason IN (
      'permission_denied',
      'cane_not_found',
      'invitation_pending',
      'provider_not_integrated',
      'user_skipped'
    ));


CREATE UNIQUE INDEX onboarding_steps_account_profile_step_idx
  ON guardme.onboarding_steps (account_id, profile_id, step) NULLS NOT DISTINCT;

CREATE OR REPLACE FUNCTION guardme.has_profile_access(p_profile uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM guardme.profile_access
    WHERE account_id = guardme.ctx_account_id()
      AND profile_id = p_profile
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION guardme.profile_relation(p_profile uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT relation
  FROM guardme.profile_access
  WHERE account_id = guardme.ctx_account_id()
    AND profile_id = p_profile
    AND status = 'active';
$$;

CREATE OR REPLACE FUNCTION guardme.shares_profile_with(p_account uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM guardme.profile_access AS mine
    JOIN guardme.profile_access AS other
      ON other.profile_id = mine.profile_id
     AND other.status = 'active'
    WHERE mine.account_id = guardme.ctx_account_id()
      AND mine.status = 'active'
      AND other.account_id = p_account
  );
$$;

REVOKE ALL ON FUNCTION guardme.has_profile_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION guardme.profile_relation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION guardme.shares_profile_with(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION guardme.has_profile_access(uuid) TO guardme_api;
GRANT EXECUTE ON FUNCTION guardme.profile_relation(uuid) TO guardme_api;
GRANT EXECUTE ON FUNCTION guardme.shares_profile_with(uuid) TO guardme_api;

REVOKE ALL ON TABLE
  guardme.profiles,
  guardme.profile_access,
  guardme.invitations,
  guardme.supervised_enrollments,
  guardme.onboarding_steps
FROM PUBLIC;

GRANT SELECT, UPDATE ON TABLE guardme.profiles TO guardme_api;
GRANT SELECT, INSERT ON TABLE guardme.profiles TO guardme_onboarding;
GRANT SELECT ON TABLE guardme.profiles TO guardme_worker;

GRANT SELECT ON TABLE guardme.profile_access TO guardme_api, guardme_worker;
GRANT UPDATE (status, revoked_at, revoked_by_account_id)
  ON TABLE guardme.profile_access TO guardme_api;
GRANT SELECT, INSERT, UPDATE ON TABLE guardme.profile_access TO guardme_onboarding;

GRANT SELECT, INSERT ON TABLE guardme.invitations TO guardme_api;
GRANT UPDATE (status) ON TABLE guardme.invitations TO guardme_api;
GRANT SELECT, UPDATE ON TABLE guardme.invitations TO guardme_onboarding;

GRANT SELECT, INSERT ON TABLE guardme.supervised_enrollments TO guardme_api;
GRANT UPDATE (status) ON TABLE guardme.supervised_enrollments TO guardme_api;
GRANT SELECT, UPDATE ON TABLE guardme.supervised_enrollments TO guardme_onboarding;

GRANT SELECT, INSERT, UPDATE ON TABLE guardme.onboarding_steps TO guardme_api;

ALTER TABLE guardme.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.profile_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.supervised_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.onboarding_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_api_select ON guardme.profiles
  FOR SELECT TO guardme_api
  USING (guardme.has_profile_access(id));

CREATE POLICY profiles_api_update ON guardme.profiles
  FOR UPDATE TO guardme_api
  USING (guardme.has_profile_access(id))
  WITH CHECK (guardme.has_profile_access(id));

CREATE POLICY profiles_onboarding_all ON guardme.profiles
  FOR ALL TO guardme_onboarding
  USING (true)
  WITH CHECK (true);

CREATE POLICY profiles_worker_select ON guardme.profiles
  FOR SELECT TO guardme_worker
  USING (true);

CREATE POLICY profile_access_api_select ON guardme.profile_access
  FOR SELECT TO guardme_api
  USING (guardme.has_profile_access(profile_id));

CREATE POLICY profile_access_api_update ON guardme.profile_access
  FOR UPDATE TO guardme_api
  USING (guardme.has_profile_access(profile_id))
  WITH CHECK (guardme.has_profile_access(profile_id));

CREATE POLICY profile_access_onboarding_all ON guardme.profile_access
  FOR ALL TO guardme_onboarding
  USING (true)
  WITH CHECK (true);

CREATE POLICY profile_access_worker_select ON guardme.profile_access
  FOR SELECT TO guardme_worker
  USING (true);

CREATE POLICY invitations_api_select ON guardme.invitations
  FOR SELECT TO guardme_api
  USING (guardme.has_profile_access(profile_id));

CREATE POLICY invitations_api_insert ON guardme.invitations
  FOR INSERT TO guardme_api
  WITH CHECK (guardme.has_profile_access(profile_id));

CREATE POLICY invitations_api_update ON guardme.invitations
  FOR UPDATE TO guardme_api
  USING (guardme.has_profile_access(profile_id))
  WITH CHECK (guardme.has_profile_access(profile_id));

CREATE POLICY invitations_onboarding_all ON guardme.invitations
  FOR ALL TO guardme_onboarding
  USING (true)
  WITH CHECK (true);

CREATE POLICY enrollments_api_select ON guardme.supervised_enrollments
  FOR SELECT TO guardme_api
  USING (guardme.has_profile_access(profile_id));

CREATE POLICY enrollments_api_insert ON guardme.supervised_enrollments
  FOR INSERT TO guardme_api
  WITH CHECK (guardme.has_profile_access(profile_id));

CREATE POLICY enrollments_api_update ON guardme.supervised_enrollments
  FOR UPDATE TO guardme_api
  USING (guardme.has_profile_access(profile_id))
  WITH CHECK (guardme.has_profile_access(profile_id));

CREATE POLICY enrollments_onboarding_all ON guardme.supervised_enrollments
  FOR ALL TO guardme_onboarding
  USING (true)
  WITH CHECK (true);

CREATE POLICY onboarding_steps_api_all ON guardme.onboarding_steps
  FOR ALL TO guardme_api
  USING (account_id = guardme.ctx_account_id())
  WITH CHECK (account_id = guardme.ctx_account_id());

CREATE POLICY accounts_api_select_peers ON guardme.accounts
  FOR SELECT TO guardme_api
  USING (guardme.shares_profile_with(id));
