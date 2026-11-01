-- PostgreSQL 17 Studio roles and studio schema (Infra #8). Apply once, as the cluster superuser
-- nexus, to DB nexus after the NexusInfra PG17 baseline (sql/pg17-baseline/01-roles.sql).
-- Secrets are supplied as environment variables only for this psql process.
-- Never print or commit their values. A pre-existing Studio role, studio or delivery schema is a stop condition.
-- Changes (one transaction): two new roles, CONNECT on nexus for them, an empty studio schema.
-- public, delivery and existing roles are not touched.
\set ON_ERROR_STOP on
\getenv studio_migrator_password NEXUS_STUDIO_MIGRATOR_PASSWORD
\getenv studio_app_password NEXUS_STUDIO_APP_PASSWORD

BEGIN;
SET LOCAL nexus.expected_system_id = :'expected_system_id';
DO $preflight$
BEGIN
    IF current_database() <> 'nexus'
       OR current_user <> 'nexus'
       OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
       OR current_setting('server_version_num')::integer < 170000
       OR current_setting('server_version_num')::integer >= 180000
       OR (SELECT system_identifier::text FROM pg_control_system()) <> current_setting('nexus.expected_system_id') THEN
        RAISE EXCEPTION 'PostgreSQL target differs from the approved 17.x cluster';
    END IF;
    -- The NexusInfra PG17 baseline must already own the database and have closed PUBLIC access.
    IF to_regrole('nexus_owner') IS NULL OR to_regrole('nexus_public') IS NULL
       OR (SELECT datdba::regrole::text FROM pg_database WHERE datname = current_database()) <> 'nexus_owner'
       OR EXISTS (SELECT 1 FROM pg_database d, aclexplode(d.datacl) a
                  WHERE d.datname = current_database() AND a.grantee = 0) THEN
        RAISE EXCEPTION 'Apply the NexusInfra PG17 baseline (01-roles.sql) first';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('nexus_studio_migrator', 'nexus_studio_app'))
       OR to_regnamespace('studio') IS NOT NULL OR to_regnamespace('delivery') IS NOT NULL THEN
        RAISE EXCEPTION 'Studio roles or the studio/delivery schema already exist';
    END IF;
    IF current_setting('password_encryption') <> 'scram-sha-256' THEN
        RAISE EXCEPTION 'password_encryption must be scram-sha-256 before Studio passwords are stored';
    END IF;
END $preflight$;
CREATE ROLE nexus_studio_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
    PASSWORD :'studio_migrator_password';
CREATE ROLE nexus_studio_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
    PASSWORD :'studio_app_password';
GRANT CONNECT ON DATABASE nexus TO nexus_studio_migrator, nexus_studio_app;
CREATE SCHEMA studio AUTHORIZATION nexus_studio_migrator;
REVOKE ALL ON SCHEMA studio FROM PUBLIC;
GRANT USAGE ON SCHEMA studio TO nexus_studio_app;
DO $postcondition$
DECLARE name text;
BEGIN
    FOREACH name IN ARRAY ARRAY['nexus_studio_migrator', 'nexus_studio_app'] LOOP
        IF has_database_privilege(name, current_database(), 'CREATE')
           OR has_schema_privilege(name, 'public', 'CREATE')
           OR pg_has_role(name, 'nexus_owner', 'MEMBER') THEN
            RAISE EXCEPTION 'Role % received unexpected privileges', name;
        END IF;
    END LOOP;
    IF has_schema_privilege('nexus_public', 'studio', 'USAGE') THEN
        RAISE EXCEPTION 'nexus_public must not reach the studio schema';
    END IF;
END $postcondition$;
COMMIT;
