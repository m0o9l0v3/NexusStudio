-- Apply once to a reviewed, disposable/new nexus_admin database as postgres.
-- Secrets are supplied as environment variables only for this psql process.
-- Never print or commit their values. A pre-existing studio schema/role is a stop condition.
\set ON_ERROR_STOP on
\getenv studio_migrator_password NEXUS_STUDIO_MIGRATOR_PASSWORD
\getenv studio_app_password NEXUS_STUDIO_APP_PASSWORD

BEGIN;
CREATE ROLE nexus_studio_migrator LOGIN PASSWORD :'studio_migrator_password';
CREATE ROLE nexus_studio_app LOGIN PASSWORD :'studio_app_password';
GRANT CONNECT ON DATABASE nexus_admin TO nexus_studio_migrator, nexus_studio_app;
CREATE SCHEMA studio AUTHORIZATION nexus_studio_migrator;
REVOKE ALL ON SCHEMA studio FROM PUBLIC;
GRANT USAGE ON SCHEMA studio TO nexus_studio_app;
COMMIT;
