#!/bin/sh
set -eu

name=${1:?image name is required}
dockerfile=${2:?Dockerfile path is required}
case "$name" in studio-api|studio-web) ;; *) exit 2 ;; esac
: "${CI_REGISTRY:?}"
: "${CI_REGISTRY_IMAGE:?}"
: "${CI_REGISTRY_USER:?}"
: "${CI_REGISTRY_PASSWORD:?}"
: "${CI_COMMIT_SHA:?}"

mkdir -p /kaniko/.docker image-digests
auth=$(printf '%s:%s' "$CI_REGISTRY_USER" "$CI_REGISTRY_PASSWORD" | base64 | tr -d '\n')
printf '{"auths":{"%s":{"auth":"%s"}}}\n' "$CI_REGISTRY" "$auth" > /kaniko/.docker/config.json
chmod 600 /kaniko/.docker/config.json
destination="$CI_REGISTRY_IMAGE/$name:$CI_COMMIT_SHA"
/kaniko/executor --context "$CI_PROJECT_DIR" --dockerfile "$dockerfile" --destination "$destination" --digest-file "image-digests/$name.digest"
digest=$(cat "image-digests/$name.digest")
case "$digest" in sha256:????????????????????????????????????????????????????????????????) ;; *) echo 'Invalid registry digest' >&2; exit 1 ;; esac
printf '%s/%s@%s\n' "$CI_REGISTRY_IMAGE" "$name" "$digest" > "image-digests/$name.txt"
rm -f /kaniko/.docker/config.json
cat "image-digests/$name.txt"
