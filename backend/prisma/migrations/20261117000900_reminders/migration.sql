-- Agenda compartida. La autoría es inmutable y la desactivación de un
-- recordatorio de cuidador queda bloqueada por una política restrictiva.

ALTER TABLE guardme.reminders ADD CONSTRAINT guardme_reminders_kind_check CHECK (kind IN ('medication', 'appointment'));
ALTER TABLE guardme.reminders ADD CONSTRAINT guardme_reminders_title_check CHECK (char_length(title) BETWEEN 1 AND 120);
ALTER TABLE guardme.reminders ADD CONSTRAINT guardme_reminders_notes_check CHECK (notes IS NULL OR char_length(notes) <= 500);
ALTER TABLE guardme.reminders ADD CONSTRAINT guardme_reminders_author_relation_check CHECK (author_relation IN ('user', 'caregiver'));
ALTER TABLE guardme.reminders ADD CONSTRAINT guardme_reminders_status_check CHECK (status IN ('active', 'inactive'));


CREATE TRIGGER reminders_bump_version
  BEFORE UPDATE ON guardme.reminders
  FOR EACH ROW
  EXECUTE FUNCTION guardme.bump_version();

ALTER TABLE guardme.reminder_schedules ADD CONSTRAINT guardme_reminder_schedules_days_of_week_check CHECK (cardinality(days_of_week) BETWEEN 1 AND 7
    AND days_of_week <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]);
ALTER TABLE guardme.reminder_schedules ADD CONSTRAINT guardme_reminder_schedules_valid_to_check CHECK (valid_to IS NULL OR valid_to >= valid_from);
ALTER TABLE guardme.reminder_schedules ADD CONSTRAINT guardme_reminder_schedules_status_check CHECK (status IN ('active', 'ended'));


ALTER TABLE guardme.reminder_occurrences ADD CONSTRAINT guardme_reminder_occurrences_status_check CHECK (status IN ('scheduled', 'taken', 'postponed', 'skipped', 'acknowledged', 'canceled'));
ALTER TABLE guardme.reminder_occurrences ADD CONSTRAINT guardme_reminder_occurrences_cancel_reason_check CHECK (cancel_reason IS NULL OR cancel_reason IN ('reminder_deactivated', 'schedule_changed'));


CREATE TRIGGER reminder_occurrences_bump_version
  BEFORE UPDATE ON guardme.reminder_occurrences
  FOR EACH ROW
  EXECUTE FUNCTION guardme.bump_version();

-- (prisma) skip reminder_occurrences_reminder_idx


CREATE INDEX reminder_occurrences_open_idx
  ON guardme.reminder_occurrences (scheduled_for)
  WHERE status IN ('scheduled', 'postponed');

REVOKE ALL ON TABLE
  guardme.reminders,
  guardme.reminder_schedules,
  guardme.reminder_occurrences
FROM PUBLIC;

GRANT SELECT, INSERT ON TABLE guardme.reminders TO guardme_api;
GRANT UPDATE (
  title, notes, status, deactivated_at, deactivated_by_account_id
) ON TABLE guardme.reminders TO guardme_api;
GRANT SELECT ON TABLE guardme.reminders TO guardme_worker;

GRANT SELECT, INSERT ON TABLE guardme.reminder_schedules TO guardme_api;
GRANT UPDATE (status, valid_to) ON TABLE guardme.reminder_schedules TO guardme_api;
GRANT SELECT ON TABLE guardme.reminder_schedules TO guardme_worker;

GRANT SELECT, INSERT ON TABLE guardme.reminder_occurrences TO guardme_api, guardme_worker;
GRANT UPDATE (
  status, cancel_reason, postponed_until, responded_by_account_id,
  responded_at, response_installation_id
) ON TABLE guardme.reminder_occurrences TO guardme_api;

ALTER TABLE guardme.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.reminder_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.reminder_occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY reminders_api ON guardme.reminders
  FOR ALL TO guardme_api
  USING (guardme.has_profile_access(profile_id))
  WITH CHECK (guardme.has_profile_access(profile_id));

CREATE POLICY reminders_api_insert_author ON guardme.reminders
  AS RESTRICTIVE
  FOR INSERT TO guardme_api
  WITH CHECK (
    author_account_id = guardme.ctx_account_id()
    AND author_relation = guardme.profile_relation(profile_id)
  );

CREATE POLICY reminders_api_keep_caregiver_active ON guardme.reminders
  AS RESTRICTIVE
  FOR UPDATE TO guardme_api
  USING (true)
  WITH CHECK (
    status = 'active'
    OR author_relation = 'user'
    OR guardme.profile_relation(profile_id) = 'caregiver'
  );

CREATE POLICY reminders_worker ON guardme.reminders
  FOR SELECT TO guardme_worker
  USING (true);

CREATE POLICY reminder_schedules_api ON guardme.reminder_schedules
  FOR ALL TO guardme_api
  USING (
    EXISTS (
      SELECT 1 FROM guardme.reminders r
      WHERE r.id = reminder_schedules.reminder_id
        AND guardme.has_profile_access(r.profile_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM guardme.reminders r
      WHERE r.id = reminder_schedules.reminder_id
        AND guardme.has_profile_access(r.profile_id)
    )
  );

CREATE POLICY reminder_schedules_worker ON guardme.reminder_schedules
  FOR SELECT TO guardme_worker
  USING (true);

CREATE POLICY reminder_occurrences_api ON guardme.reminder_occurrences
  FOR ALL TO guardme_api
  USING (
    EXISTS (
      SELECT 1 FROM guardme.reminders r
      WHERE r.id = reminder_occurrences.reminder_id
        AND guardme.has_profile_access(r.profile_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM guardme.reminders r
      WHERE r.id = reminder_occurrences.reminder_id
        AND guardme.has_profile_access(r.profile_id)
    )
  );

CREATE POLICY reminder_occurrences_worker_select ON guardme.reminder_occurrences
  FOR SELECT TO guardme_worker
  USING (true);

CREATE POLICY reminder_occurrences_worker_insert ON guardme.reminder_occurrences
  FOR INSERT TO guardme_worker
  WITH CHECK (true);
