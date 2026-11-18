-- Aviso lógico por destinatario y una entrega por instalación.
-- El worker encola el envío desde la misma transacción que crea el aviso.

ALTER TABLE guardme.notifications ADD CONSTRAINT guardme_notifications_type_check CHECK (type IN (
      'incident_fall',
      'incident_manual',
      'incident_delayed',
      'incident_update',
      'postpone_reminder',
      'postpone_collective',
      'followup_question',
      'reminder_occurrence'
    ));
ALTER TABLE guardme.notifications ADD CONSTRAINT guardme_notifications_status_check CHECK (status IN ('pending', 'dispatched', 'no_destination', 'expired', 'discarded'));
ALTER TABLE guardme.notifications ADD CONSTRAINT guardme_notifications_priority_check CHECK (priority IN ('urgent', 'attention', 'agenda', 'operational'));


-- (prisma) skip notifications_recipient_idx


ALTER TABLE guardme.notification_deliveries ADD CONSTRAINT guardme_notification_deliveries_channel_check CHECK (channel IN ('fcm', 'fake'));
ALTER TABLE guardme.notification_deliveries ADD CONSTRAINT guardme_notification_deliveries_status_check CHECK (status IN ('pending', 'accepted', 'failed', 'token_invalid'));


REVOKE ALL ON TABLE guardme.notifications, guardme.notification_deliveries FROM PUBLIC;

GRANT SELECT ON TABLE guardme.notifications TO guardme_api;
GRANT SELECT, INSERT ON TABLE guardme.notifications TO guardme_worker;
GRANT UPDATE (status) ON TABLE guardme.notifications TO guardme_worker;

GRANT SELECT ON TABLE guardme.notification_deliveries TO guardme_api, guardme_worker;
GRANT UPDATE (received_at, opened_at) ON TABLE guardme.notification_deliveries TO guardme_api;
GRANT INSERT, UPDATE ON TABLE guardme.notification_deliveries TO guardme_worker;

GRANT EXECUTE ON FUNCTION guardme.enqueue_pending_action(text, text, uuid, text, jsonb, timestamptz, int)
  TO guardme_worker;

ALTER TABLE guardme.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardme.notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_api_select ON guardme.notifications
  FOR SELECT TO guardme_api
  USING (guardme.has_profile_access(profile_id));

CREATE POLICY notifications_worker_select ON guardme.notifications
  FOR SELECT TO guardme_worker
  USING (true);

CREATE POLICY notifications_worker_insert ON guardme.notifications
  FOR INSERT TO guardme_worker
  WITH CHECK (true);

CREATE POLICY notifications_worker_update ON guardme.notifications
  FOR UPDATE TO guardme_worker
  USING (true)
  WITH CHECK (true);

CREATE POLICY notification_deliveries_api_select ON guardme.notification_deliveries
  FOR SELECT TO guardme_api
  USING (
    EXISTS (
      SELECT 1
      FROM guardme.notifications AS n
      WHERE n.id = notification_deliveries.notification_id
        AND guardme.has_profile_access(n.profile_id)
    )
  );

CREATE POLICY notification_deliveries_api_update ON guardme.notification_deliveries
  FOR UPDATE TO guardme_api
  USING (
    installation_id = guardme.ctx_installation_id()
    AND EXISTS (
      SELECT 1
      FROM guardme.notifications AS n
      WHERE n.id = notification_deliveries.notification_id
        AND n.recipient_account_id = guardme.ctx_account_id()
    )
  )
  WITH CHECK (
    installation_id = guardme.ctx_installation_id()
    AND EXISTS (
      SELECT 1
      FROM guardme.notifications AS n
      WHERE n.id = notification_deliveries.notification_id
        AND n.recipient_account_id = guardme.ctx_account_id()
    )
  );

CREATE POLICY notification_deliveries_worker_all ON guardme.notification_deliveries
  FOR ALL TO guardme_worker
  USING (true)
  WITH CHECK (true);
