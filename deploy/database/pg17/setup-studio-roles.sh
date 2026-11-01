#!/bin/sh
# PostgreSQL 17 (current production cluster) variant of ../setup-studio-roles.sh (Infra #8).
# The PG18 script and its version guard stay unchanged; this script pins its own target:
# DB nexus, cluster superuser nexus, 17.x, the approved cluster identifier, and the NexusInfra
# PG17 baseline (01-roles.sql) already applied. Run order: README.md in this directory.
set -eu
umask 077

: "${NEXUS_STUDIO_MIGRATOR_PASSWORD:?Load the migration password from a private file first}"
: "${NEXUS_STUDIO_APP_PASSWORD:?Load the runtime password from a private file first}"
[ "${#NEXUS_STUDIO_MIGRATOR_PASSWORD}" -ge 32 ] && [ "${#NEXUS_STUDIO_APP_PASSWORD}" -ge 32 ] || {
    echo 'Studio role passwords must be at least 32 characters' >&2; exit 2;
}
[ "$NEXUS_STUDIO_MIGRATOR_PASSWORD" != "$NEXUS_STUDIO_APP_PASSWORD" ] || {
    echo 'Migration and runtime passwords must differ' >&2; exit 2;
}
: "${NEXUS_STUDIO_TARGET_ENV:?Set verification or production explicitly}"
case "$NEXUS_STUDIO_TARGET_ENV" in
    verification) ;;
    production)
        [ "${ALLOW_PRODUCTION_STUDIO_PG17_ROLE_SETUP:-}" = 1 ] || {
            echo 'Production PG17 role setup requires separate explicit approval' >&2; exit 2;
        } ;;
    *) echo 'Unknown Studio role target environment' >&2; exit 2 ;;
esac
: "${NEXUS_STUDIO_TARGET_HOST:?Set the reviewed database host or socket directory}"
: "${NEXUS_STUDIO_TARGET_PORT:?Set the reviewed database port}"
case "$NEXUS_STUDIO_TARGET_PORT" in *[!0-9]*|'') echo 'Invalid database port' >&2; exit 2 ;; esac
[ "$NEXUS_STUDIO_TARGET_PORT" -ge 1 ] && [ "$NEXUS_STUDIO_TARGET_PORT" -le 65535 ] || {
    echo 'Invalid database port' >&2; exit 2;
}
: "${NEXUS_STUDIO_EXPECTED_SYSTEM_ID:?Record the approved target cluster identifier first}"
case "$NEXUS_STUDIO_EXPECTED_SYSTEM_ID" in *[!0-9]*|'') echo 'Invalid cluster identifier' >&2; exit 2 ;; esac

# One read-only query; no role/schema DDL is attempted when the target differs.
metadata=$(psql -X -w -qAt -F '|' -v ON_ERROR_STOP=1 \
    -h "$NEXUS_STUDIO_TARGET_HOST" -p "$NEXUS_STUDIO_TARGET_PORT" -U nexus -d nexus \
    -c "SELECT current_database(), current_user, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)::text, current_setting('server_version_num'), system_identifier::text FROM pg_control_system()") || {
    echo 'Could not verify the PostgreSQL target' >&2; exit 2;
}
IFS='|' read -r actual_db actual_user is_superuser version_num actual_system_id <<EOF_METADATA
$metadata
EOF_METADATA
case "$version_num" in *[!0-9]*|'') echo 'Invalid PostgreSQL version response' >&2; exit 2 ;; esac
if [ "$actual_db" != nexus ] || [ "$actual_user" != nexus ] || [ "$is_superuser" != true ] ||
   [ "$version_num" -lt 170000 ] || [ "$version_num" -ge 180000 ] ||
   [ "$actual_system_id" != "$NEXUS_STUDIO_EXPECTED_SYSTEM_ID" ]; then
    echo 'PostgreSQL target does not match the approved 17.x cluster and database' >&2
    exit 2
fi

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
exec psql -X -w -v ON_ERROR_STOP=1 -v expected_system_id="$NEXUS_STUDIO_EXPECTED_SYSTEM_ID" \
    -h "$NEXUS_STUDIO_TARGET_HOST" -p "$NEXUS_STUDIO_TARGET_PORT" -U nexus -d nexus \
    -f "$script_dir/setup-studio-roles.sql"
