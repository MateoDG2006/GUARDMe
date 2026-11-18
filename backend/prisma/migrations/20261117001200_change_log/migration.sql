-- Bitácora de cambios compartidos. El cursor no entrega transacciones todavía abiertas.

ALTER TABLE guardme.change_log ADD CONSTRAINT guardme_change_log_op_check CHECK (op IN ('upsert', 'delete'));


-- (prisma) skip change_log_txid_seq_idx

-- (prisma) skip change_log_profile_txid_seq_idx


CREATE OR REPLACE FUNCTION guardme.log_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile uuid;
  v_type text;
  v_op text := 'upsert';
  v_version int;
  v_id uuid;
BEGIN
  v_id := NEW.id;
  IF TG_TABLE_NAME = 'profiles' THEN
    v_profile := NEW.id;
    v_type := 'profile';
    v_version := NEW.version;
    IF NEW.status = 'archived' THEN v_op := 'delete'; END IF;
  ELSIF TG_TABLE_NAME = 'profile_access' THEN
    v_profile := NEW.profile_id;
    v_type := 'membership';
    v_version := NEW.version;
    IF NEW.status = 'revoked' THEN v_op := 'delete'; END IF;
  ELSIF TG_TABLE_NAME = 'contacts' THEN
    v_profile := NEW.profile_id;
    v_type := 'contact';
    v_version := NEW.version;
    IF NEW.status = 'removed' THEN v_op := 'delete'; END IF;
  ELSIF TG_TABLE_NAME = 'cane_assignments' THEN
    v_profile := NEW.profile_id;
    v_type := 'cane';
    IF NEW.ended_at IS NOT NULL THEN v_op := 'delete'; END IF;
  ELSIF TG_TABLE_NAME = 'gateways' THEN
    SELECT profile_id INTO v_profile
    FROM guardme.cane_assignments
    WHERE id = NEW.cane_assignment_id;
    v_type := 'gateway';
    IF NEW.ended_at IS NOT NULL THEN v_op := 'delete'; END IF;
  ELSIF TG_TABLE_NAME = 'incidents' THEN
    v_profile := NEW.profile_id;
    v_type := 'incident';
    v_version := NEW.version;
  ELSIF TG_TABLE_NAME = 'reminders' THEN
    v_profile := NEW.profile_id;
    v_type := 'reminder';
    v_version := NEW.version;
    IF NEW.status = 'inactive' THEN v_op := 'delete'; END IF;
  ELSIF TG_TABLE_NAME = 'reminder_occurrences' THEN
    SELECT profile_id INTO v_profile
    FROM guardme.reminders
    WHERE id = NEW.reminder_id;
    v_type := 'occurrence';
    v_version := NEW.version;
    IF NEW.status = 'canceled' THEN v_op := 'delete'; END IF;
  ELSIF TG_TABLE_NAME = 'followups' THEN
    v_profile := NEW.profile_id;
    v_type := 'followup';
    v_version := NEW.version;
  ELSIF TG_TABLE_NAME = 'location_consents' THEN
    v_profile := NEW.profile_id;
    v_type := 'location_consent';
    v_version := NEW.version;
    IF NEW.revoked_at IS NOT NULL THEN v_op := 'delete'; END IF;
  ELSE
    RETURN NULL;
  END IF;
  IF v_profile IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO guardme.change_log (txid, profile_id, resource_type, resource_id, op, version)
  VALUES (pg_current_xact_id(), v_profile, v_type, v_id, v_op, v_version);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION guardme.log_change() FROM PUBLIC;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'profiles',
    'profile_access',
    'contacts',
    'cane_assignments',
    'gateways',
    'incidents',
    'reminders',
    'reminder_occurrences',
    'followups',
    'location_consents'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I_log_change ON guardme.%I',
      tbl,
      tbl
    );
    EXECUTE format(
      'CREATE TRIGGER %I_log_change AFTER INSERT OR UPDATE ON guardme.%I FOR EACH ROW EXECUTE FUNCTION guardme.log_change()',
      tbl,
      tbl
    );
  END LOOP;
END;
$$;

REVOKE ALL ON TABLE guardme.change_log FROM PUBLIC;
GRANT SELECT ON TABLE guardme.change_log TO guardme_api;
GRANT DELETE ON TABLE guardme.change_log TO guardme_worker;

ALTER TABLE guardme.change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY change_log_api_select ON guardme.change_log
  FOR SELECT TO guardme_api
  USING (guardme.has_profile_access(profile_id));

CREATE POLICY change_log_worker_delete ON guardme.change_log
  FOR DELETE TO guardme_worker
  USING (true);
