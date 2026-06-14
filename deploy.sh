#!/usr/bin/env bash
# ============================================================================
# Fair Trade — one-shot Kali Linux deployer
#   sudo ./deploy.sh
#
# Installs system deps, builds the TanStack Start app, configures Nginx as a
# reverse proxy in front of the Node server, and publishes the site as a
# Tor v3 hidden service. Idempotent — safe to re-run.
# ============================================================================
set -Eeuo pipefail
IFS=$'\n\t'

# ---------------------------------------------------------------------------
# Paths & constants
# ---------------------------------------------------------------------------
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="fairtrade"
APP_USER="${SUDO_USER:-$(id -un)}"
APP_PORT="3000"
NGINX_PORT="8080"
NGINX_PUBLIC_PORT="80"
TOR_HS_DIR="/var/lib/tor/${APP_NAME}"
LOG_DIR="${PROJECT_DIR}/deploy/logs"
LOG_FILE="${LOG_DIR}/deploy.log"
ENV_FILE="${PROJECT_DIR}/.env"

mkdir -p "${LOG_DIR}"
exec > >(tee -a "${LOG_FILE}") 2>&1

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
c_red='\033[0;31m'; c_grn='\033[0;32m'; c_ylw='\033[0;33m'; c_blu='\033[0;34m'; c_rst='\033[0m'
log()  { printf "${c_blu}[deploy]${c_rst} %s\n" "$*"; }
ok()   { printf "${c_grn}[ ok ]${c_rst}  %s\n" "$*"; }
warn() { printf "${c_ylw}[warn]${c_rst}  %s\n" "$*"; }
die()  { printf "${c_red}[fail]${c_rst}  %s\n" "$*" >&2; exit 1; }

trap 'die "deploy.sh failed at line ${LINENO}. See ${LOG_FILE}"' ERR

[[ ${EUID} -eq 0 ]] || die "Run with sudo: sudo ./deploy.sh"

log "Project dir: ${PROJECT_DIR}"
log "App user:    ${APP_USER}"
log "Log file:    ${LOG_FILE}"

# ---------------------------------------------------------------------------
# 1. System dependencies
# ---------------------------------------------------------------------------
log "Updating apt index"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y

PKGS=(curl git ca-certificates build-essential nginx tor lsof procps)
MISSING=()
for p in "${PKGS[@]}"; do dpkg -s "$p" >/dev/null 2>&1 || MISSING+=("$p"); done
if ((${#MISSING[@]})); then
  log "Installing: ${MISSING[*]}"
  apt-get install -y "${MISSING[@]}"
fi

# Node.js 20.x via NodeSource if not present or too old
need_node=1
if command -v node >/dev/null 2>&1; then
  ver="$(node -v | sed 's/v//;s/\..*//')"
  [[ "${ver}" -ge 20 ]] && need_node=0
fi
if [[ ${need_node} -eq 1 ]]; then
  log "Installing Node.js 20.x"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
ok "node $(node -v) / npm $(npm -v)"

# ---------------------------------------------------------------------------
# 2. .env validation
# ---------------------------------------------------------------------------
if [[ ! -f "${ENV_FILE}" ]]; then
  warn ".env missing — creating template"
  cat > "${ENV_FILE}" <<'EOF'
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_PROJECT_ID=
PORT=3000
HOST=127.0.0.1
NODE_ENV=production
EOF
fi
chmod 600 "${ENV_FILE}"
chown "${APP_USER}:${APP_USER}" "${ENV_FILE}"
ok ".env present"

# ---------------------------------------------------------------------------
# 3. Free required ports
# ---------------------------------------------------------------------------
free_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti tcp:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    warn "Port ${port} busy (pids: ${pids}) — terminating"
    kill -TERM ${pids} 2>/dev/null || true
    sleep 1
    kill -KILL ${pids} 2>/dev/null || true
  fi
}
# Don't kill tor's SOCKS ports if tor will own them later — only free our app/web ports
for p in 80 8080 3000 4173; do free_port "$p"; done
# 9050/9051 are owned by tor itself; only free if not held by tor
for p in 9050 9051; do
  pid="$(lsof -ti tcp:"$p" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pid}" ]] && ! ps -p "${pid}" -o comm= | grep -q '^tor'; then
    warn "Port $p held by non-tor pid ${pid} — killing"
    kill -KILL "${pid}" || true
  fi
done
ok "Ports clear"

# ---------------------------------------------------------------------------
# 4. Install & build the app (as app user)
# ---------------------------------------------------------------------------
log "Installing npm dependencies (--legacy-peer-deps)"
chown -R "${APP_USER}:${APP_USER}" "${PROJECT_DIR}"
sudo -u "${APP_USER}" -H bash -lc "cd '${PROJECT_DIR}' && npm install --legacy-peer-deps --no-audit --no-fund" \
  || { warn "npm install failed — retrying after cache clean"; \
       sudo -u "${APP_USER}" -H bash -lc "cd '${PROJECT_DIR}' && npm cache clean --force && rm -rf node_modules package-lock.json && npm install --legacy-peer-deps --no-audit --no-fund"; }

log "Building production bundle"
sudo -u "${APP_USER}" -H bash -lc "cd '${PROJECT_DIR}' && npm run build" \
  || { warn "build failed — retrying once"; sudo -u "${APP_USER}" -H bash -lc "cd '${PROJECT_DIR}' && rm -rf .output .nitro dist && npm run build"; }

# Validate build output (TanStack Start emits .output/server/index.mjs via nitro)
BUILD_OK=0
for candidate in ".output/server/index.mjs" "dist/server/index.mjs" ".vinxi/build/server/index.mjs"; do
  if [[ -f "${PROJECT_DIR}/${candidate}" ]]; then
    BUILD_OK=1; ok "Build artifact: ${candidate}"; break
  fi
done
[[ ${BUILD_OK} -eq 1 ]] || die "Build did not produce a server entry. Inspect ${LOG_FILE}."

# ---------------------------------------------------------------------------
# 5. systemd unit for the Node server
# ---------------------------------------------------------------------------
log "Writing systemd unit"
NODE_BIN="$(command -v node)"
cat > "/etc/systemd/system/${APP_NAME}.service" <<EOF
[Unit]
Description=Fair Trade web app
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${PROJECT_DIR}
EnvironmentFile=${ENV_FILE}
Environment=PORT=${APP_PORT}
Environment=HOST=127.0.0.1
Environment=NODE_ENV=production
ExecStart=${PROJECT_DIR}/deploy/start.sh
Restart=always
RestartSec=3
StandardOutput=append:${LOG_DIR}/app.log
StandardError=append:${LOG_DIR}/app.err.log

[Install]
WantedBy=multi-user.target
EOF
chmod +x "${PROJECT_DIR}/deploy/start.sh"
systemctl daemon-reload
systemctl enable "${APP_NAME}.service" >/dev/null
systemctl restart "${APP_NAME}.service"

# Wait for the app to bind
log "Waiting for app on 127.0.0.1:${APP_PORT}"
for i in {1..30}; do
  if curl -fsS -o /dev/null "http://127.0.0.1:${APP_PORT}/" 2>/dev/null; then ok "App is up"; break; fi
  sleep 1
  [[ $i -eq 30 ]] && die "App did not start. tail ${LOG_DIR}/app.err.log"
done

# ---------------------------------------------------------------------------
# 6. Nginx reverse proxy (LAN + localhost on :80, loopback on :8080 for tor)
# ---------------------------------------------------------------------------
log "Configuring Nginx"
install -m 0644 "${PROJECT_DIR}/deploy/nginx.conf" "/etc/nginx/sites-available/${APP_NAME}"
ln -sf "/etc/nginx/sites-available/${APP_NAME}" "/etc/nginx/sites-enabled/${APP_NAME}"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx >/dev/null
systemctl restart nginx
ok "Nginx serving on :${NGINX_PUBLIC_PORT} (LAN) and 127.0.0.1:${NGINX_PORT} (Tor)"

# ---------------------------------------------------------------------------
# 7. Tor hidden service
# ---------------------------------------------------------------------------
log "Configuring Tor hidden service"
TORRC="/etc/tor/torrc"
if ! grep -q "HiddenServiceDir ${TOR_HS_DIR}" "${TORRC}"; then
  cat >> "${TORRC}" <<EOF

# ---- ${APP_NAME} (added by deploy.sh) ----
HiddenServiceDir ${TOR_HS_DIR}
HiddenServicePort 80 127.0.0.1:${NGINX_PORT}
HiddenServiceVersion 3
EOF
fi
install -d -m 0700 -o debian-tor -g debian-tor "${TOR_HS_DIR}" 2>/dev/null || \
  install -d -m 0700 "${TOR_HS_DIR}"
systemctl enable tor >/dev/null
systemctl restart tor

# Wait for onion hostname
log "Waiting for .onion hostname"
for i in {1..30}; do
  [[ -s "${TOR_HS_DIR}/hostname" ]] && break
  sleep 1
done
ONION="$(cat "${TOR_HS_DIR}/hostname" 2>/dev/null || echo '(not ready)')"

# ---------------------------------------------------------------------------
# 8. Summary
# ---------------------------------------------------------------------------
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
printf "${c_grn}========================================================${c_rst}\n"
printf "${c_grn} Fair Trade deployed successfully${c_rst}\n"
printf "${c_grn}========================================================${c_rst}\n"
printf " Local:    http://localhost/\n"
printf " LAN:      http://%s/\n" "${LAN_IP:-<no-ip>}"
printf " Onion:    http://%s/\n" "${ONION}"
printf "\n Service:  systemctl status ${APP_NAME}\n"
printf " Logs:     %s\n" "${LOG_DIR}"
printf "${c_grn}========================================================${c_rst}\n"