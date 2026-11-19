#!/bin/sh
set -eu

if [ -n "${BIFROST_HOST:-}" ]; then
    export BIFROST_BASE_URL="http://${BIFROST_HOST}:8080/openai"
fi

exec uvicorn benchify.main:app --host 0.0.0.0 --port "${PORT:-8000}" \
    --workers 1 --timeout-graceful-shutdown 25 --no-access-log
