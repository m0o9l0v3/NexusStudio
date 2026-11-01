#!/bin/sh
# Disposable PG17 shaped like the current production cluster (DB nexus, superuser nexus), Infra #8.
set -eu

sh -n deploy/database/pg17/setup-studio-roles.sh
for attempt in $(seq 1 30); do
  if pg_isready -h postgres -U nexus -d nexus; then break; fi
  sleep 1
done
pg_isready -h postgres -U nexus -d nexus

expect_denied() { # role password sql description
  if PGPASSWORD="$2" psql -X -v ON_ERROR_STOP=1 -U "$1" -d nexus -c "$3" >/dev/null 2>&1; then
    echo "unexpectedly allowed: $4" >&2; exit 1
  fi
}
no_studio_objects() {
  psql -X -w -v ON_ERROR_STOP=1 -U nexus -d nexus -Atc "SELECT count(*) FROM pg_roles WHERE rolname LIKE 'nexus_studio_%'" | grep -qx 0
  psql -X -w -v ON_ERROR_STOP=1 -U nexus -d nexus -Atc "SELECT count(*) FROM pg_namespace WHERE nspname = 'studio'" | grep -qx 0
}

export NEXUS_STUDIO_MIGRATOR_PASSWORD=ci-disposable-migrator-password-123456
export NEXUS_STUDIO_APP_PASSWORD=ci-disposable-runtime-password-654321
export NEXUS_STUDIO_TARGET_ENV=verification NEXUS_STUDIO_TARGET_HOST=postgres NEXUS_STUDIO_TARGET_PORT=5432
export NEXUS_STUDIO_EXPECTED_SYSTEM_ID=$(psql -X -w -v ON_ERROR_STOP=1 -U nexus -d nexus -Atc 'SELECT system_identifier FROM pg_control_system()')
public_password=ci-disposable-public-password-000000

# Without the NexusInfra PG17 baseline the setup stops before any DDL.
if sh deploy/database/pg17/setup-studio-roles.sh >/dev/null 2>&1; then
  echo 'setup ran before the PG17 baseline' >&2; exit 1
fi
no_studio_objects

# A baseline that changed the owner but left the default database ACL (NULL datacl, PUBLIC CONNECT) is incomplete.
psql -X -v ON_ERROR_STOP=1 -U nexus -d nexus -c "CREATE ROLE nexus_owner NOLOGIN; CREATE ROLE nexus_public LOGIN PASSWORD '$public_password'; ALTER DATABASE nexus OWNER TO nexus_owner;"
psql -X -v ON_ERROR_STOP=1 -U nexus -d nexus -Atc "SELECT datacl IS NULL FROM pg_database WHERE datname = 'nexus'" | grep -qx t
if sh deploy/database/pg17/setup-studio-roles.sh >/dev/null 2>&1; then
  echo 'setup ran while PUBLIC still had the default database privileges' >&2; exit 1
fi
no_studio_objects
psql -X -v ON_ERROR_STOP=1 -U nexus -d nexus -c "ALTER DATABASE nexus OWNER TO nexus; DROP ROLE nexus_public; DROP ROLE nexus_owner;"

# Same effect as NexusInfra sql/pg17-baseline/01-roles.sql (kept inline: CI has no Infra checkout).
psql -X -v ON_ERROR_STOP=1 -U nexus -d nexus -c "CREATE ROLE nexus_owner NOLOGIN; CREATE ROLE nexus_admin_app NOLOGIN; CREATE ROLE nexus_public LOGIN PASSWORD '$public_password'; ALTER DATABASE nexus OWNER TO nexus_owner; REVOKE ALL ON DATABASE nexus FROM PUBLIC; GRANT CONNECT ON DATABASE nexus TO nexus_admin_app, nexus_public; ALTER SCHEMA public OWNER TO nexus_owner; REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO nexus_admin_app, nexus_public;"

if NEXUS_STUDIO_EXPECTED_SYSTEM_ID=0 sh deploy/database/pg17/setup-studio-roles.sh >/dev/null 2>&1; then
  echo 'wrong cluster identifier was accepted' >&2; exit 1
fi
if NEXUS_STUDIO_TARGET_ENV=production sh deploy/database/pg17/setup-studio-roles.sh >/dev/null 2>&1; then
  echo 'production target ran without its separate approval flag' >&2; exit 1
fi
no_studio_objects

sh deploy/database/pg17/setup-studio-roles.sh
if sh deploy/database/pg17/setup-studio-roles.sh >/dev/null 2>&1; then
  echo 'role setup was applied twice' >&2; exit 1
fi
psql -X -v ON_ERROR_STOP=1 -U nexus -d nexus -Atc "SELECT bool_or(rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) FROM pg_roles WHERE rolname IN ('nexus_studio_app', 'nexus_studio_migrator')" | grep -qx f
expect_denied nexus_studio_migrator "$NEXUS_STUDIO_MIGRATOR_PASSWORD" 'CREATE SCHEMA forbidden' 'migrator CREATE SCHEMA'

PGPASSWORD="$NEXUS_STUDIO_MIGRATOR_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U nexus_studio_migrator -d nexus -f artifacts/studio/migrate.sql
PGPASSWORD="$NEXUS_STUDIO_MIGRATOR_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U nexus_studio_migrator -d nexus -f artifacts/studio/migrate.sql >/dev/null
psql -X -v ON_ERROR_STOP=1 -U nexus -d nexus -Atc "SELECT count(*) FROM pg_class WHERE relnamespace = 'studio'::regnamespace AND relowner <> 'nexus_studio_migrator'::regrole" | grep -qx 0
PGPASSWORD="$NEXUS_STUDIO_MIGRATOR_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U nexus_studio_migrator -d nexus -c 'CREATE TABLE studio.permission_probe(id integer PRIMARY KEY)'
psql -X -v ON_ERROR_STOP=1 -U nexus -d nexus -f deploy/database/grant-studio-runtime.sql
psql -X -v ON_ERROR_STOP=1 -U nexus -d nexus -f deploy/database/grant-studio-runtime.sql >/dev/null

PGPASSWORD="$NEXUS_STUDIO_APP_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U nexus_studio_app -d nexus -c 'INSERT INTO studio.permission_probe VALUES (1)'
PGPASSWORD="$NEXUS_STUDIO_APP_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U nexus_studio_app -d nexus -Atc 'SELECT count(*) FROM studio.permission_probe' | grep -qx 1
psql -X -v ON_ERROR_STOP=1 -U nexus -d nexus -c 'CREATE TABLE public.private_probe(id integer)'
expect_denied nexus_studio_app "$NEXUS_STUDIO_APP_PASSWORD" 'CREATE TABLE studio.forbidden(id integer)' 'runtime DDL'
expect_denied nexus_studio_app "$NEXUS_STUDIO_APP_PASSWORD" 'SELECT * FROM studio."__EFMigrationsHistory"' 'runtime reads migration history'
expect_denied nexus_studio_app "$NEXUS_STUDIO_APP_PASSWORD" 'SELECT * FROM public.private_probe' 'runtime reads public schema data'
expect_denied nexus_studio_app "$NEXUS_STUDIO_APP_PASSWORD" 'SET ROLE nexus_studio_migrator' 'runtime switches to the migrator'
expect_denied nexus_studio_app "$NEXUS_STUDIO_APP_PASSWORD" 'CREATE ROLE forbidden' 'runtime CREATE ROLE'
# ID 予約表は追記専用（nexus-mobile E2-5 §5.5）。runtime は追記できるが、変更・削除はできない。
PGPASSWORD="$NEXUS_STUDIO_APP_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U nexus_studio_app -d nexus -c "INSERT INTO studio.id_reservations (sequence, id, entity_kind, state, created_at, source) VALUES (1, 'probe_spot', 'spot', 'active', now(), 'import')"
for statement in "UPDATE studio.id_reservations SET state = 'retired'" "DELETE FROM studio.id_reservations" "TRUNCATE studio.id_reservations"; do
  expect_denied nexus_studio_app "$NEXUS_STUDIO_APP_PASSWORD" "$statement" "ID reservation ledger: $statement"
done
expect_denied nexus_studio_migrator "$NEXUS_STUDIO_MIGRATOR_PASSWORD" 'CREATE TABLE public.forbidden(id integer)' 'migrator writes to public schema'
# public-api の nexus_public は studio を読めない（契約B）。
expect_denied nexus_public "$public_password" 'SELECT * FROM studio.permission_probe' 'nexus_public reads studio'
expect_denied nexus_public "$public_password" 'SELECT * FROM studio.releases' 'nexus_public reads studio releases'
echo 'Studio PG17 role, migration and runtime grant checks passed'
