#!/usr/bin/env bash
# =============================================================================
# Fair Trade — one-command Kali deployment
#
#   sudo ./deploy.sh
#
# Builds the pure-static Vite SPA, configures Nginx to serve it on port 80,
# configures a Tor v3 hidden service that proxies to the same site, prints
# every reachable URL (localhost, LAN, .onion) at the end. Idempotent —
# safe to re-run after edits.
# =============================================================================
set -Eeuo pipefail

SITE_NAME="fairtrade"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_ROOT="/var/www/${SITE_NAME}"
NGINX_AVAILABLE="/etc/nginx/sites-available/${SITE_NAME}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${SITE_NAME}"
TOR_HS_DIR="/var/lib/tor/${SITE_NAME}"
TORRC="/etc/tor/torrc"
TOR_MARK_BEGIN="# >>> ${SITE_NAME} hidden service >>>"
TOR_MARK_END="# <<< ${SITE_NAME} hidden service <<<"

RED=$'\e[31m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; BLUE=$'\e[34m'; BOLD=$'\e[1m'; RESET=$'\e[0m'
log()  { printf '%s[deploy]%s %s\n' "$BLUE"  "$RESET" "$*"; }
ok()   { printf '%s[ ok  ]%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '%s[warn ]%s %s\n' "$YELLOW" "$RESET" "$*"; }
die()  { printf '%s[fail ]%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }

trap 'die "deploy failed on line $LINENO"' ERR

[[ $EUID -eq 0 ]] || die "Run with sudo: sudo ./deploy.sh"
command -v apt-get >/dev/null || die "apt-get not found — this script targets Kali/Debian."

# --------------------------------------------------------------- env
if [[ ! -f "${APP_DIR}/.env" ]]; then
  die ".env not found at ${APP_DIR}/.env (must contain VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY)"
fi
set -a; . "${APP_DIR}/.env"; set +a
: "${VITE_SUPABASE_URL:?VITE_SUPABASE_URL missing from .env}"
: "${VITE_SUPABASE_PUBLISHABLE_KEY:?VITE_SUPABASE_PUBLISHABLE_KEY missing from .env}"

# --------------------------------------------------------------- deps
install_pkg() {
  local pkg="$1" bin="$2"
  if command -v "$bin" >/dev/null 2>&1; then
    ok "$pkg already installed"
  else
    log "installing $pkg"
    DEBIAN_FRONTEND=noninteractive apt-get update -y >/dev/null
    DEBIAN_FRONTEND=noninteractive apt-get install -y "$pkg" >/dev/null
  fi
}
install_pkg curl curl
install_pkg nginx nginx
install_pkg tor tor

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//;s/\..*//')" -lt 20 ]]; then
  log "installing Node.js 20.x"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs >/dev/null
fi
ok "node $(node -v)"

# Run build steps as the invoking user so node_modules stays usable later.
RUN_USER="${SUDO_USER:-root}"
as_user() { sudo -u "$RUN_USER" --preserve-env=PATH bash -lc "$1"; }

# --------------------------------------------------------------- build
cd "$APP_DIR"
log "installing JS dependencies"
if ! as_user "cd '$APP_DIR' && npm install --no-audit --no-fund --loglevel=error"; then
  warn "npm install failed — wiping node_modules and retrying"
  rm -rf node_modules package-lock.json
  as_user "cd '$APP_DIR' && npm install --no-audit --no-fund --loglevel=error" || die "npm install failed twice"
fi

log "building static bundle"
if ! as_user "cd '$APP_DIR' && npm run build"; then
  warn "build failed — clearing vite cache and retrying"
  rm -rf node_modules/.vite dist
  as_user "cd '$APP_DIR' && npm run build" || die "vite build failed twice"
fi
[[ -f "${APP_DIR}/dist/index.html" ]] || die "dist/index.html missing after build"
ok "static bundle built"

# --------------------------------------------------------------- publish to web root
install -d -o www-data -g www-data -m 755 "$WEB_ROOT"
rm -rf "${WEB_ROOT:?}"/*
cp -a "${APP_DIR}/dist/." "${WEB_ROOT}/"
chown -R www-data:www-data "$WEB_ROOT"
ok "published to $WEB_ROOT"

# --------------------------------------------------------------- port conflicts
free_port() {
  local port="$1"
  local pids
  pids=$(ss -ltnpH "sport = :$port" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u || true)
  for pid in $pids; do
    local name; name=$(ps -p "$pid" -o comm= 2>/dev/null || echo "?")
    case "$name" in
      nginx|tor) : ;;  # will be restarted below
      *) warn "killing $name (pid $pid) holding port $port"; kill -TERM "$pid" 2>/dev/null || true ;;
    esac
  done
}
for p in 80 8080 9050 9051; do free_port "$p"; done

# --------------------------------------------------------------- nginx
install -d -m 755 /etc/nginx/sites-available /etc/nginx/sites-enabled
sed -e "s|@WEB_ROOT@|${WEB_ROOT}|g" "${APP_DIR}/deploy/nginx.conf" > "$NGINX_AVAILABLE"
ln -sf "$NGINX_AVAILABLE" "$NGINX_ENABLED"
[[ -e /etc/nginx/sites-enabled/default ]] && rm -f /etc/nginx/sites-enabled/default
nginx -t >/dev/null 2>&1 || { nginx -t; die "nginx config test failed"; }
systemctl enable --now nginx >/dev/null 2>&1 || service nginx start
systemctl reload nginx >/dev/null 2>&1 || systemctl restart nginx
ok "nginx serving ${WEB_ROOT} on :80 and 127.0.0.1:8080"

# --------------------------------------------------------------- tor
if ! grep -qF "$TOR_MARK_BEGIN" "$TORRC"; then
  log "adding hidden-service block to $TORRC"
  {
    printf '\n%s\n' "$TOR_MARK_BEGIN"
    sed -e "s|@HS_DIR@|${TOR_HS_DIR}|g" "${APP_DIR}/deploy/torrc.snippet"
    printf '%s\n' "$TOR_MARK_END"
  } >> "$TORRC"
else
  log "tor block already present (idempotent)"
fi
install -d -o debian-tor -g debian-tor -m 700 "$TOR_HS_DIR" 2>/dev/null || install -d -m 700 "$TOR_HS_DIR"
systemctl enable --now tor >/dev/null 2>&1 || service tor start
systemctl restart tor

log "waiting for Tor to publish the v3 onion address"
ONION=""
for _ in $(seq 1 30); do
  if [[ -f "${TOR_HS_DIR}/hostname" ]]; then
    ONION=$(cat "${TOR_HS_DIR}/hostname")
    [[ -n "$ONION" ]] && break
  fi
  sleep 1
done

# --------------------------------------------------------------- summary
LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo
printf '%s===========================================================%s\n' "$BOLD" "$RESET"
printf '%s  Fair Trade is live%s\n' "$BOLD$GREEN" "$RESET"
printf '%s===========================================================%s\n' "$BOLD" "$RESET"
printf '  Local      : %shttp://localhost%s\n' "$BLUE" "$RESET"
[[ -n "${LAN_IP:-}" ]] && printf '  LAN        : %shttp://%s%s\n' "$BLUE" "$LAN_IP" "$RESET"
if [[ -n "$ONION" ]]; then
  printf '  Tor onion  : %shttp://%s%s\n' "$BLUE" "$ONION" "$RESET"
else
  warn "Tor onion address not ready yet — check: cat ${TOR_HS_DIR}/hostname"
fi
echo
printf '  Re-deploy  : sudo ./deploy.sh   (idempotent)\n'
printf '  Nginx log  : journalctl -u nginx -f\n'
printf '  Tor log    : journalctl -u tor -f\n'
echo