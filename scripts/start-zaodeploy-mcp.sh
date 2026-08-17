#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

if [ -z "${ZAODEPLOY_CONNECTION_KEY:-}" ]; then
  echo "ZAODEPLOY_CONNECTION_KEY is required" >&2
  exit 1
fi

exec node "$ROOT_DIR/apps/mcp-server/dist/server.js"
