-- Run after each reviewed Studio migration. Keep migration history migrator-only.
-- Append-only tables (ID reservation ledger, nexus-mobile E2-5 §5.5) get SELECT and INSERT only.
\set ON_ERROR_STOP on
BEGIN;
REVOKE ALL ON ALL TABLES IN SCHEMA studio FROM nexus_studio_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA studio FROM nexus_studio_app;
DO $grant$
DECLARE item record;
BEGIN
  FOR item IN SELECT tablename FROM pg_tables
              WHERE schemaname = 'studio' AND tablename NOT IN ('__EFMigrationsHistory', 'id_reservations')
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE studio.%I TO nexus_studio_app', item.tablename);
  END LOOP;
  IF to_regclass('studio.id_reservations') IS NOT NULL THEN
    GRANT SELECT, INSERT ON TABLE studio.id_reservations TO nexus_studio_app;
  END IF;
END $grant$;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA studio TO nexus_studio_app;
COMMIT;
