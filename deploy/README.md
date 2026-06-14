# Fair Trade — Deployment

One-shot deployer for Kali Linux. From the project root:

```bash
sudo ./deploy.sh
```

On success the site is reachable at:

- `http://localhost/` (loopback)
- `http://<LAN-IP>/` (printed at the end)
- `http://<hash>.onion/` via Tor Browser (printed at the end)

## What it does

1. Installs system deps — `curl git build-essential nginx tor lsof` and
   Node.js 20.x via NodeSource.
2. Ensures `.env` exists (creates a template if missing) with `chmod 600`.
3. Frees ports 80, 8080, 3000, 4173, 9050, 9051 (the last two only when not
   owned by tor).
4. `npm install --legacy-peer-deps` then `npm run build`, retrying once with
   a clean cache on failure. Validates that `.output/server/index.mjs`
   exists.
5. Installs and starts the `fairtrade.service` systemd unit, which runs
   `deploy/start.sh`.
6. Installs `deploy/nginx.conf` as `/etc/nginx/sites-enabled/fairtrade`,
   removes `default`, validates with `nginx -t`, reloads.
7. Appends the hidden-service block from `deploy/torrc.snippet` to
   `/etc/tor/torrc` (only if not already present), restarts tor, prints
   the generated `.onion` hostname.

## Folder structure

```
deploy.sh                  # entry point, run with sudo
deploy/
├── start.sh               # launched by systemd; runs the built Node server
├── nginx.conf             # reverse proxy: :80 (LAN) + 127.0.0.1:8080 (Tor)
├── torrc.snippet          # appended to /etc/tor/torrc once
├── logs/                  # deploy.log, app.log, app.err.log
└── README.md              # this file
```

## Operations

```bash
sudo systemctl status fairtrade    # app status
sudo systemctl restart fairtrade   # restart node server
sudo systemctl restart nginx       # reload web tier
sudo systemctl restart tor         # rotate tor (NOT the onion key)
sudo cat /var/lib/tor/fairtrade/hostname   # show .onion address
tail -f deploy/logs/app.err.log    # live error log
```

## Idempotency

Re-running `sudo ./deploy.sh` is safe:

- apt steps short-circuit when packages are present
- the torrc block is guarded with a `grep -q`
- the systemd unit and nginx site are rewritten in place
- the build dir is replaced atomically by `npm run build`
- the existing `.env` and the onion identity in `/var/lib/tor/fairtrade/`
  are never touched

## Backing up the onion identity

```bash
sudo tar czf ~/fairtrade-onion.tgz /var/lib/tor/fairtrade
```

Restore the tarball to bring the same `.onion` back after a reinstall.