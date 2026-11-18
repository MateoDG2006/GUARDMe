-- Roles, contexto RLS y bump_version. Las contraseñas las fija prisma/seed.ts.

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'guardme_api',
    'guardme_onboarding',
    'guardme_worker',
    'guardme_ingest',
    'guardme_auth'
  ]
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'CREATE ROLE %I NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT',
        role_name
      );
    END IF;
  END LOOP;
END
$$;

DO $$
BEGIN
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO guardme_api, guardme_onboarding, guardme_worker, guardme_ingest, guardme_auth',
    current_database()
  );
END
$$;

REVOKE ALL ON SCHEMA guardme FROM PUBLIC;
GRANT USAGE ON SCHEMA guardme TO
  guardme_api, guardme_onboarding, guardme_worker, guardme_ingest;

ALTER DEFAULT PRIVILEGES IN SCHEMA guardme REVOKE ALL ON TABLES FROM PUBLIC;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION guardme.ctx_account_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('guardme.account_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION guardme.ctx_auth_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('guardme.auth_user_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION guardme.ctx_installation_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('guardme.installation_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION guardme.bump_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
