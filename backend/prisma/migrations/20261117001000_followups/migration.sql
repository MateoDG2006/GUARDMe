-- Un seguimiento por cierre. updated_at existe para el trigger de versión.

ALTER TABLE guardme.followups ADD CONSTRAINT guardme_followups_status_check CHECK (status IN (
      'scheduled',
      'awaiting_user',
      'awaiting_caregiver',
      'awaiting_last',
      'closed_ok',
      'closed_no_followup',
      'closed_encouraged',
      'closed_inconclusive'
    ));


CREATE TRIGGER followups_bump_version
  BEFORE UPDATE ON guardme.followups
  FOR EACH ROW
  EXECUTE FUNCTION guardme.bump_version();

ALTER TABLE guardme.followup_questions ADD CONSTRAINT guardme_followup_questions_round_check CHECK (round IN ('first', 'caregiver', 'last'));
ALTER TABLE guardme.followup_questions ADD CONSTRAINT guardme_followup_questions_recipient_kind_check CHECK (recipient_kind IN ('user', 'caregiver'));
ALTER TABLE guardme.followup_questions ADD CONSTRAINT guardme_followup_questions_status_check CHECK (status IN ('scheduled', 'published', 'answered', 'expired', 'canceled'));


CREATE TRIGGER followup_questions_bump_version
  BEFORE UPDATE ON guardme.followup_questions
  FOR EACH ROW
  EXECUTE FUNCTION guardme.bump_version();

ALTER TABLE guardme.followup_responses ADD CONSTRAINT guardme_followup_responses_option_check CHECK (option IN ('well', 'not_well', 'no_followup_needed'));


CREATE UNIQUE INDEX followup_responses_one_applied
  ON guardme.followup_responses (question_id)
  WHERE applied;

REVOKE ALL ON TABLE
  guardme.followups,
  guardme.followup_questions,
  guardme.followup_responses
FROM PUBLIC;

GRANT SELECT, INSERT ON TABLE guardme.followups TO guardme_api;
GRANT UPDATE (status, closed_at) ON TABLE guardme.followups TO guardme_api;
GRANT SELECT, UPDATE ON TABLE guardme.followups TO guardme_worker;

GRANT SELECT, INSERT ON TABLE guardme.followup_questions TO guardme_api;
GRANT UPDATE (status) ON TABLE guardme.followup_questions TO guardme_api;
GRANT SELECT, INSERT, UPDATE ON TABLE guardme.followup_questions TO guardme_worker;

GRANT SELECT, INSERT ON TABLE guardme.followup_responses TO guardme_api;
GRANT SELECT ON TABLE guardme.followup_responses TO guardme_worker;

ALTER TABLE guardme.followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.followup_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.followup_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY followups_api ON guardme.followups
  FOR ALL TO guardme_api
  USING (guardme.has_profile_access(profile_id))
  WITH CHECK (guardme.has_profile_access(profile_id));

CREATE POLICY followups_worker_select ON guardme.followups
  FOR SELECT TO guardme_worker
  USING (true);

CREATE POLICY followups_worker_update ON guardme.followups
  FOR UPDATE TO guardme_worker
  USING (true)
  WITH CHECK (true);

CREATE POLICY followup_questions_api ON guardme.followup_questions
  FOR ALL TO guardme_api
  USING (
    EXISTS (
      SELECT 1 FROM guardme.followups f
      WHERE f.id = followup_questions.followup_id
        AND guardme.has_profile_access(f.profile_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM guardme.followups f
      WHERE f.id = followup_questions.followup_id
        AND guardme.has_profile_access(f.profile_id)
    )
  );

CREATE POLICY followup_questions_worker ON guardme.followup_questions
  FOR ALL TO guardme_worker
  USING (true)
  WITH CHECK (true);

CREATE POLICY followup_responses_api ON guardme.followup_responses
  FOR ALL TO guardme_api
  USING (
    EXISTS (
      SELECT 1
      FROM guardme.followup_questions q
      JOIN guardme.followups f ON f.id = q.followup_id
      WHERE q.id = followup_responses.question_id
        AND guardme.has_profile_access(f.profile_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM guardme.followup_questions q
      JOIN guardme.followups f ON f.id = q.followup_id
      WHERE q.id = followup_responses.question_id
        AND guardme.has_profile_access(f.profile_id)
    )
  );

CREATE POLICY followup_responses_worker ON guardme.followup_responses
  FOR SELECT TO guardme_worker
  USING (true);
