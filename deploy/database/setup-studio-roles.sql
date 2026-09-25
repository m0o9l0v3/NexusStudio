-- Apply once to a reviewed, disposable/new nexus_admin database as postgres.
-- Secrets are supplied as environment variables only for this psql process.
-- Never print or commit their values. A pre-existing studio schema/role is a stop condition.
\set ON_ERROR_STOP on
\getenv studio_migrator_password NEXUS_STUDIO_MIGRATOR_PASSWORD
\getenv studio_app_password NEXUS_STUDIO_APP_PASSWORD

BEGIN;
SET LOCAL nexus.expected_system_id = :'expected_system_id';
DO $preflight$
BEGIN
    IF current_database() <> 'nexus_admin'
       OR current_user <> 'postgres'
       OR current_setting('server_version_num')::integer < 180000
       OR current_setting('server_version_num')::integer >= 190000
       OR (SELECT system_identifier::text FROM pg_control_system()) <> current_setting('nexus.expected_system_id') THEN
        RAISE EXCEPTION 'PostgreSQL target differs from the approved 18.x cluster';
    END IF;
END $preflight$;
CREATE ROLE nexus_studio_migrator LOGIN PASSWORD :'studio_migrator_password';
CREATE ROLE nexus_studio_app LOGIN PASSWORD :'studio_app_password';
GRANT CONNECT ON DATABASE nexus_admin TO nexus_studio_migrator, nexus_studio_app;
CREATE SCHEMA studio AUTHORIZATION nexus_studio_migrator;
REVOKE ALL ON SCHEMA studio FROM PUBLIC;
GRANT USAGE ON SCHEMA studio TO nexus_studio_app;
COMMIT;
