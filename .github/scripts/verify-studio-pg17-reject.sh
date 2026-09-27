#!/bin/sh
set -eu

for attempt in $(seq 1 30); do
  if pg_isready -h postgres -U postgres -d nexus_admin; then break; fi
  sleep 1
done
pg_isready -h postgres -U postgres -d nexus_admin

export NEXUS_STUDIO_MIGRATOR_PASSWORD=ci-disposable-migrator-password-123456
export NEXUS_STUDIO_APP_PASSWORD=ci-disposable-runtime-password-654321
export NEXUS_STUDIO_TARGET_ENV=verification NEXUS_STUDIO_TARGET_HOST=postgres NEXUS_STUDIO_TARGET_PORT=5432
export NEXUS_STUDIO_EXPECTED_SYSTEM_ID=$(psql -X -w -v ON_ERROR_STOP=1 -U postgres -d nexus_admin -Atc 'SELECT system_identifier FROM pg_control_system()')
if sh deploy/database/setup-studio-roles.sh >/dev/null 2>&1; then
  echo 'PostgreSQL 17 was incorrectly accepted for Studio role setup' >&2; exit 1
fi
psql -X -w -v ON_ERROR_STOP=1 -U postgres -d nexus_admin -Atc "SELECT count(*) FROM pg_roles WHERE rolname LIKE 'nexus_studio_%'" | grep -qx 0
psql -X -w -v ON_ERROR_STOP=1 -U postgres -d nexus_admin -Atc "SELECT count(*) FROM pg_namespace WHERE nspname = 'studio'" | grep -qx 0

