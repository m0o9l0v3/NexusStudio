#!/bin/sh
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
script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
exec psql -X -v ON_ERROR_STOP=1 -U postgres -d nexus_admin -f "$script_dir/setup-studio-roles.sql"
