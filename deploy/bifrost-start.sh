#!/bin/sh
set -eu

if [ "${#BIFROST_ENCRYPTION_KEY}" -lt 32 ] ||
   [ "${#BIFROST_SETUP_TOKEN}" -lt 32 ] ||
   [ "${#BIFROST_ADMIN_PASSWORD}" -lt 16 ] ||
   [ -z "${BIFROST_ADMIN_USERNAME}" ] ||
   [ "${#BIFROST_VIRTUAL_KEY}" -lt 32 ] ||
   [ -z "${BIFROST_PROVIDER_API_KEY}" ]; then
    echo 'Bifrost secrets are unset or too short. Check the protected environment file.' >&2
    exit 1
fi

exec /app/docker-entrypoint.sh
