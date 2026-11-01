#!/bin/sh
# Disposable PG17 for the spot rename trial (NexusStudio decision record 32). Never the live engine objects.
set -eu
T=$(cd "$(dirname "$0")" && pwd)
INFRA=/Users/m09/Desktop/アプリ開発/Nexus/nexus-infra
STUDIO=/Users/m09/Desktop/アプリ開発/Nexus/nexus-studio
IMAGE=postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
NAME=nexus-rename-trial-pg NET=nexus-rename-trial-net VOL=nexus-rename-trial-db
docker ps -a --format '{{.Names}}' | grep -qx nexus-postgres-1 && { echo live container present >&2; exit 1; }
docker volume ls --format '{{.Name}}' | grep -qx nexus_postgres_data && { echo live volume present >&2; exit 1; }
docker volume ls --format '{{.Name}}' | grep -qx $VOL && { echo trial volume exists >&2; exit 1; }
mkdir -m 700 "$T/secrets"
for n in superuser public migrator app admin_password; do openssl rand -hex 24 > "$T/secrets/$n"; chmod 600 "$T/secrets/$n"; done
printf 'Host=127.0.0.1;Port=55432;Database=nexus;Username=nexus_studio_app;Password=%s' "$(cat $T/secrets/app)" > "$T/secrets/app_connection"; chmod 600 "$T/secrets/app_connection"
docker network create $NET >/dev/null
docker volume create $VOL >/dev/null
POSTGRES_PASSWORD=$(cat $T/secrets/superuser) docker run -d --name $NAME --network $NET -v $VOL:/var/lib/postgresql/data \
  -e POSTGRES_USER=nexus -e POSTGRES_DB=nexus -e POSTGRES_PASSWORD -p 127.0.0.1:55432:5432 $IMAGE >/dev/null
for i in $(seq 1 60); do docker exec $NAME pg_isready -h localhost -U nexus -d nexus >/dev/null 2>&1 && break; sleep 1; done
sleep 2; docker exec $NAME pg_isready -h localhost -U nexus -d nexus
su() { docker exec -i "$@"; }
psu() { docker exec -i $NAME psql -h localhost -U nexus -d nexus -X -q -v ON_ERROR_STOP=1 "$@"; }
docker exec $NAME psql -U nexus -d nexus -XAtc 'SHOW server_version'
NEXUS_PUBLIC_PASSWORD=$(cat $T/secrets/public) docker exec -i -e NEXUS_PUBLIC_PASSWORD $NAME psql -h localhost -U nexus -d nexus -X -q -v ON_ERROR_STOP=1 < $INFRA/sql/pg17-baseline/01-roles.sql
SYSID=$(docker exec $NAME psql -U nexus -d nexus -XAtc 'SELECT system_identifier FROM pg_control_system()')
NEXUS_STUDIO_MIGRATOR_PASSWORD=$(cat $T/secrets/migrator) NEXUS_STUDIO_APP_PASSWORD=$(cat $T/secrets/app) \
  docker exec -i -e NEXUS_STUDIO_MIGRATOR_PASSWORD -e NEXUS_STUDIO_APP_PASSWORD $NAME psql -h localhost -U nexus -d nexus -X -q -v ON_ERROR_STOP=1 -v expected_system_id=$SYSID < $STUDIO/deploy/database/pg17/setup-studio-roles.sql
psu -v studio_migrator=nexus_studio_migrator -v studio_app=nexus_studio_app < $INFRA/sql/pg17-baseline/02-delivery-schema.sql
PGPASSWORD=$(cat $T/secrets/migrator) docker exec -i -e PGPASSWORD $NAME psql -h localhost -U nexus_studio_migrator -d nexus -X -q -v ON_ERROR_STOP=1 < "$1" >/dev/null
psu < $STUDIO/deploy/database/grant-studio-runtime.sql
psu -v studio_migrator=nexus_studio_migrator -v studio_app=nexus_studio_app < $INFRA/sql/pg17-baseline/03-grant-delivery.sql
docker exec $NAME psql -U nexus -d nexus -XAtc 'SELECT count(*) FROM studio."__EFMigrationsHistory"'
echo setup done
