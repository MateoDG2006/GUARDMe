-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "guardme";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "identity";

-- CreateTable
CREATE TABLE "guardme"."audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_account_id" UUID,
    "actor_kind" TEXT,
    "profile_id" UUID,
    "operation" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlation_id" UUID,
    "details" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."idempotency_keys" (
    "account_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("account_id","key")
);

-- CreateTable
CREATE TABLE "guardme"."pending_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "run_at" TIMESTAMPTZ(6) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "lease_until" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "auth_user_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL DEFAULT '',
    "onboarding_kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."installations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "client_installation_id" UUID NOT NULL,
    "auth_session_id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "app_version" TEXT NOT NULL,
    "push_token" TEXT,
    "push_token_updated_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'active',
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" TEXT,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "display_name" TEXT NOT NULL,
    "time_zone" TEXT NOT NULL DEFAULT 'America/Panama',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by_account_id" UUID NOT NULL,
    "contacts_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."profile_access" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "relation" TEXT NOT NULL,
    "caregiver_category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_via" TEXT NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_account_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "profile_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_id" UUID NOT NULL,
    "issued_by_account_id" UUID NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "recipient_hint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_by_account_id" UUID,
    "consumed_at" TIMESTAMPTZ(6),
    "created_access_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."supervised_enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_id" UUID NOT NULL,
    "issued_by_account_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_by_account_id" UUID,
    "consumed_by_installation_id" UUID,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supervised_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."onboarding_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "profile_id" UUID,
    "step" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."canes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "serial" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "firmware_version" TEXT,
    "claim_secret_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "canes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."cane_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cane_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    "assigned_by_account_id" UUID NOT NULL,
    "ended_by_account_id" UUID,

    CONSTRAINT "cane_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."gateways" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cane_id" UUID NOT NULL,
    "cane_assignment_id" UUID NOT NULL,
    "installation_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    "end_reason" TEXT,
    "last_event_at" TIMESTAMPTZ(6),

    CONSTRAINT "gateways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "priority" SMALLINT,
    "linked_account_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."event_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "installation_id" UUID NOT NULL,
    "cane_id" UUID NOT NULL,
    "cane_assignment_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detail" TEXT,

    CONSTRAINT "event_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."false_alarm_counters" (
    "profile_id" UUID NOT NULL,
    "cane_id" UUID NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "false_alarm_counters_pkey" PRIMARY KEY ("profile_id","cane_id")
);

-- CreateTable
CREATE TABLE "guardme"."cane_telemetry_latest" (
    "cane_assignment_id" UUID NOT NULL,
    "cane_id" UUID NOT NULL,
    "battery_pct" SMALLINT,
    "charging" BOOLEAN,
    "sensor_status" TEXT,
    "link_status" TEXT,
    "captured_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "source_installation_id" UUID NOT NULL,

    CONSTRAINT "cane_telemetry_latest_pkey" PRIMARY KEY ("cane_assignment_id")
);

-- CreateTable
CREATE TABLE "guardme"."incidents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_id" UUID NOT NULL,
    "cane_id" UUID,
    "cane_assignment_id" UUID,
    "origin" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "escalation_reason" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "reported_occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_delayed" BOOLEAN NOT NULL DEFAULT false,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by_account_id" UUID,
    "created_by_installation_id" UUID NOT NULL,
    "context" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."incident_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "incident_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "actor_kind" TEXT NOT NULL,
    "actor_account_id" UUID,
    "actor_installation_id" UUID,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "context" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "incident_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" TEXT NOT NULL,
    "profile_id" UUID NOT NULL,
    "recipient_account_id" UUID NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID NOT NULL,
    "resource_version" INTEGER NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."notification_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notification_id" UUID NOT NULL,
    "installation_id" UUID NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'fcm',
    "provider_ref" TEXT,
    "status" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "received_at" TIMESTAMPTZ(6),
    "opened_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."call_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "incident_id" UUID NOT NULL,
    "policy_version" TEXT NOT NULL,
    "contacts_snapshot" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "stopped_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."call_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "call_plan_id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "ordinal" SMALLINT NOT NULL,
    "contact_id" UUID NOT NULL,
    "contact_name" TEXT NOT NULL,
    "contact_phone_e164" TEXT NOT NULL,
    "linked_account_id" UUID,
    "channel" TEXT NOT NULL DEFAULT 'pstn',
    "provider" TEXT NOT NULL,
    "provider_ref" TEXT,
    "status" TEXT NOT NULL,
    "status_reason" TEXT,
    "requested_at" TIMESTAMPTZ(6),
    "answered_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "last_provider_rank" SMALLINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."provider_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "provider_ref" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sequence" INTEGER,
    "provider_timestamp" TIMESTAMPTZ(6),
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMPTZ(6),
    "apply_result" TEXT,

    CONSTRAINT "provider_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."caregiver_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "incident_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "option" TEXT NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_incident_version" INTEGER NOT NULL,
    "resulting_status" TEXT NOT NULL,

    CONSTRAINT "caregiver_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."reminders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "author_account_id" UUID NOT NULL,
    "author_relation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "deactivated_at" TIMESTAMPTZ(6),
    "deactivated_by_account_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."reminder_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reminder_id" UUID NOT NULL,
    "local_time" TIME(6) NOT NULL,
    "days_of_week" SMALLINT[],
    "time_zone" TEXT NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."reminder_occurrences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reminder_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "scheduled_for" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "cancel_reason" TEXT,
    "postponed_until" TIMESTAMPTZ(6),
    "responded_by_account_id" UUID,
    "responded_at" TIMESTAMPTZ(6),
    "response_installation_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."followups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "incident_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "closing_account_id" UUID NOT NULL,
    "time_zone" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "followups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."followup_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "followup_id" UUID NOT NULL,
    "round" TEXT NOT NULL,
    "recipient_kind" TEXT NOT NULL,
    "recipient_account_ids" UUID[],
    "publish_at" TIMESTAMPTZ(6) NOT NULL,
    "deadline_at" TIMESTAMPTZ(6) NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "followup_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."followup_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "option" TEXT NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied" BOOLEAN NOT NULL,

    CONSTRAINT "followup_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."location_consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_id" UUID NOT NULL,
    "granted_by_account_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_account_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."location_read_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consent_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "location_read_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardme"."location_latest" (
    "profile_id" UUID NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy_m" DOUBLE PRECISION NOT NULL,
    "captured_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "installation_id" UUID NOT NULL,

    CONSTRAINT "location_latest_pkey" PRIMARY KEY ("profile_id")
);

-- CreateTable
CREATE TABLE "guardme"."change_log" (
    "seq" BIGSERIAL NOT NULL,
    "txid" xid8 NOT NULL DEFAULT pg_current_xact_id(),
    "profile_id" UUID NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID NOT NULL,
    "op" TEXT NOT NULL,
    "version" INTEGER,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_log_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "guardme"."worker_heartbeats" (
    "worker_id" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "last_beat_at" TIMESTAMPTZ(6) NOT NULL,
    "version" TEXT NOT NULL,

    CONSTRAINT "worker_heartbeats_pkey" PRIMARY KEY ("worker_id")
);

-- CreateTable
CREATE TABLE "identity"."users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMPTZ(6),
    "refresh_token_expires_at" TIMESTAMPTZ(6),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."verifications" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_actions_dedupe_key_key" ON "guardme"."pending_actions"("dedupe_key");

-- CreateIndex
CREATE INDEX "pending_actions_status_run_at_idx" ON "guardme"."pending_actions"("status", "run_at");

-- CreateIndex
CREATE INDEX "pending_actions_resource_idx" ON "guardme"."pending_actions"("resource_type", "resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_auth_user_id_key" ON "guardme"."accounts"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_secret_hash_key" ON "guardme"."invitations"("secret_hash");

-- CreateIndex
CREATE UNIQUE INDEX "supervised_enrollments_code_hash_key" ON "guardme"."supervised_enrollments"("code_hash");

-- CreateIndex
CREATE UNIQUE INDEX "canes_serial_key" ON "guardme"."canes"("serial");

-- CreateIndex
CREATE UNIQUE INDEX "event_receipts_source_key_key" ON "guardme"."event_receipts"("source_key");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_source_key_key" ON "guardme"."incidents"("source_key");

-- CreateIndex
CREATE INDEX "incidents_profile_occurred_idx" ON "guardme"."incidents"("profile_id", "occurred_at", "id");

-- CreateIndex
CREATE INDEX "incident_events_incident_idx" ON "guardme"."incident_events"("incident_id", "at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "guardme"."notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_recipient_idx" ON "guardme"."notifications"("recipient_account_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_notification_id_installation_id_key" ON "guardme"."notification_deliveries"("notification_id", "installation_id");

-- CreateIndex
CREATE UNIQUE INDEX "call_plans_incident_id_key" ON "guardme"."call_plans"("incident_id");

-- CreateIndex
CREATE UNIQUE INDEX "call_attempts_call_plan_id_ordinal_key" ON "guardme"."call_attempts"("call_plan_id", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "provider_events_provider_event_key_key" ON "guardme"."provider_events"("provider", "event_key");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_occurrences_schedule_id_scheduled_for_key" ON "guardme"."reminder_occurrences"("schedule_id", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "followups_incident_id_key" ON "guardme"."followups"("incident_id");

-- CreateIndex
CREATE UNIQUE INDEX "followup_questions_followup_id_round_key" ON "guardme"."followup_questions"("followup_id", "round");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "identity"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "identity"."sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_idx" ON "identity"."sessions"("user_id");

-- CreateIndex
CREATE INDEX "accounts_user_idx" ON "identity"."accounts"("user_id");

-- AddForeignKey
ALTER TABLE "guardme"."accounts" ADD CONSTRAINT "accounts_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

