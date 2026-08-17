#!/bin/zsh
set -euo pipefail

keychain_value() {
  security find-generic-password -a zaodeploy -s "$1" -w
}

export ZAODEPLOY_CONNECTION_KEY="$(keychain_value zaodeploy-employee-token)"

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
exec node "$ROOT_DIR/apps/mcp-server/dist/server.js"
