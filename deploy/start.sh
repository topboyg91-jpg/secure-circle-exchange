#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# deploy/start.sh — launches the built TanStack Start Node server.
# Invoked by the systemd unit installed by deploy.sh. Safe to run by hand:
#   ./deploy/start.sh
# ----------------------------------------------------------------------------
set -Eeuo pipefail
IFS=$'\n\t'

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${HERE}/.." && pwd)"
cd "${ROOT}"

# Load .env (export every assignment) without clobbering values systemd already set
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

: "${PORT:=3000}"
: "${HOST:=127.0.0.1}"
: "${NODE_ENV:=production}"
export PORT HOST NODE_ENV

# Resolve server entry produced by `npm run build` (TanStack Start / nitro).
ENTRY=""
for candidate in ".output/server/index.mjs" "dist/server/index.mjs" ".vinxi/build/server/index.mjs"; do
  if [[ -f "${ROOT}/${candidate}" ]]; then ENTRY="${ROOT}/${candidate}"; break; fi
done

if [[ -z "${ENTRY}" ]]; then
  echo "[start.sh] No build output found. Run: npm run build" >&2
  exit 1
fi

echo "[start.sh] Starting ${ENTRY} on ${HOST}:${PORT}"
exec node "${ENTRY}"