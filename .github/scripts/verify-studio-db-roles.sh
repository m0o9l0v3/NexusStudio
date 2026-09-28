#!/bin/sh
set -eu

sh -n deploy/database/setup-studio-roles.sh
for attempt in $(seq 1 30); do
  if pg_isready -h postgres -U postgres -d nexus_admin; then break; fi
  sleep 1
done
pg_isready -h postgres -U postgres -d nexus_admin

psql -X -v ON_ERROR_STOP=1 -U postgres -d nexus_admin -c 'CREATE ROLE nexus_owner NOLOGIN; ALTER DATABASE nexus_admin OWNER TO nexus_owner; REVOKE ALL ON DATABASE nexus_admin FROM PUBLIC; ALTER SCHEMA public OWNER TO nexus_owner; REVOKE ALL ON SCHEMA public FROM PUBLIC;'
export NEXUS_STUDIO_MIGRATOR_PASSWORD=ci-disposable-migrator-password-123456
export NEXUS_STUDIO_APP_PASSWORD=ci-disposable-runtime-password-654321
export NEXUS_STUDIO_TARGET_ENV=verification NEXUS_STUDIO_TARGET_HOST=postgres NEXUS_STUDIO_TARGET_PORT=5432
export NEXUS_STUDIO_EXPECTED_SYSTEM_ID=$(psql -X -w -v ON_ERROR_STOP=1 -U postgres -d nexus_admin -Atc 'SELECT system_identifier FROM pg_control_system()')
if NEXUS_STUDIO_EXPECTED_SYSTEM_ID=0 sh deploy/database/setup-studio-roles.sh >/dev/null 2>&1; then
  echo 'wrong cluster identifier was accepted' >&2; exit 1
fi
psql -X -w -v ON_ERROR_STOP=1 -U postgres -d nexus_admin -Atc "SELECT count(*) FROM pg_roles WHERE rolname LIKE 'nexus_studio_%'" | grep -qx 0
psql -X -w -v ON_ERROR_STOP=1 -U postgres -d nexus_admin -Atc "SELECT count(*) FROM pg_namespace WHERE nspname = 'studio'" | grep -qx 0

sh deploy/database/setup-studio-roles.sh
PGPASSWORD="$NEXUS_STUDIO_MIGRATOR_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U nexus_studio_migrator -d nexus_admin -f artifacts/studio/migrate.sql
PGPASSWORD="$NEXUS_STUDIO_MIGRATOR_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U nexus_studio_migrator -d nexus_admin -c 'CREATE TABLE studio.permission_probe(id integer PRIMARY KEY)'
psql -X -v ON_ERROR_STOP=1 -U postgres -d nexus_admin -f deploy/database/grant-studio-runtime.sql
psql -X -v ON_ERROR_STOP=1 -U postgres -d nexus_admin -Atc "SELECT bool_or(rolsuper OR rolcreatedb OR rolcreaterole) FROM pg_roles WHERE rolname IN ('nexus_studio_app', 'nexus_studio_migrator')" | grep -q '^f$'
PGPASSWORD="$NEXUS_STUDIO_APP_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U nexus_studio_app -d nexus_admin -c 'INSERT INTO studio.permission_probe VALUES (1)'
PGPASSWORD="$NEXUS_STUDIO_APP_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U nexus_studio_app -d nexus_admin -Atc 'SELECT count(*) FROM studio.permission_probe' | grep -qx 1
psql -X -v ON_ERROR_STOP=1 -U postgres -d nexus_admin -c 'CREATE TABLE public.private_probe(id integer)'
if PGPASSWORD="$NEXUS_STUDIO_APP_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U nexus_studio_app -d nexus_admin -c 'CREATE TABLE studio.forbidden(id integer)' >/dev/null 2>&1; then
  echo 'runtime role unexpectedly has DDL rights' >&2; exit 1
fi
if PGPASSWORD="$NEXUS_STUDIO_APP_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U nexus_studio_app -d nexus_admin -c 'SELECT * FROM studio."__EFMigrationsHistory"' >/dev/null 2>&1; then
  echo 'runtime role unexpectedly reads migration history' >&2; exit 1
fi
if PGPASSWORD="$NEXUS_STUDIO_APP_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U nexus_studio_app -d nexus_admin -c 'SELECT * FROM public.private_probe' >/dev/null 2>&1; then
  echo 'runtime role unexpectedly reads public schema data' >&2; exit 1
fi
if PGPASSWORD="$NEXUS_STUDIO_MIGRATOR_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U nexus_studio_migrator -d nexus_admin -c 'CREATE TABLE public.forbidden(id integer)' >/dev/null 2>&1; then
  echo 'migration role unexpectedly writes to public schema' >&2; exit 1
fi

