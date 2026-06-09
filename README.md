# Fair Trade — Anonymous Crypto Escrow

A Tor-friendly community escrow platform. The web app is a React + TanStack Start
frontend talking to a Supabase Postgres backend. For onion deployment you front
the Node build with Nginx and publish it as a Tor hidden service.

## Stack

| Layer       | Technology                                                       |
|-------------|------------------------------------------------------------------|
| Frontend    | React 19, TanStack Router/Start, Tailwind v4                     |
| Backend     | Supabase (Postgres + Auth + RLS)                                  |
| Web server  | Node (production build) behind Nginx reverse proxy                |
| Anonymity   | Tor hidden service (v3 onion)                                     |
| Crypto      | Manual deposit addresses, approved via the admin Domain Panel     |

## Application surface

- `/`              — landing page + How it Works
- `/terms`         — binding terms
- `/faq`           — frequently asked questions
- `/start-trade`   — buyer/seller creates a trade; receives Trade ID + password
- `/check-trade`   — lookup any trade by Trade ID, shows active deposit address
- `/auth`          — admin login / signup
- `/admin`         — Domain Panel: add, approve (toggle Active), and delete deposit addresses

Passwords are hashed in the browser (SHA-256) before they reach the database;
only the hash is ever stored.

## Repository layout

```
src/
  routes/                 # file-based router (pages + API routes)
  components/SiteLayout   # shared header / panel / footer
  integrations/supabase/  # generated client + auth helpers
  lib/hash.ts             # SHA-256 helper used to hash trade passwords
supabase/migrations/      # Postgres schema (trades, crypto_addresses, user_roles)
```

## Environment variables (.env)

These are read at both build and runtime. **Keep this file out of git, but
keep it stable across restarts** — do not regenerate keys unless you mean to
invalidate every session.

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOi...   # public anon key, safe to ship
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...        # secret — server only
PORT=3000
NODE_ENV=production
```

Persistence checklist:
1. Commit `.env.example` only. Keep the real `.env` outside the git tree
   (e.g. `/etc/fairtrade/.env`) and symlink: `ln -s /etc/fairtrade/.env .env`.
2. Back it up: `cp /etc/fairtrade/.env /etc/fairtrade/.env.bak`.
3. The systemd unit (below) loads it with `EnvironmentFile=` so values
   survive every restart.

## Local hosting on Kali Linux

Run everything as a non-root user (e.g. `fairtrade`). Commands below assume
`bash`, `sudo`, and Kali rolling.

### 1. Install dependencies

```bash
sudo apt update
sudo apt install -y curl git nginx tor
curl -fsSL https://bun.sh/install | bash       # or: sudo apt install nodejs npm
export PATH="$HOME/.bun/bin:$PATH"
```

### 2. Clone and build

```bash
git clone <your-repo> /opt/fairtrade
cd /opt/fairtrade
sudo mkdir -p /etc/fairtrade
sudo cp .env.example /etc/fairtrade/.env       # then edit with real values
sudo chown -R fairtrade:fairtrade /opt/fairtrade /etc/fairtrade
sudo chmod 600 /etc/fairtrade/.env
ln -sf /etc/fairtrade/.env .env
bun install
bun run build
```

### 3. Run the Node server on a fixed port (3000)

`/etc/systemd/system/fairtrade.service`

```ini
[Unit]
Description=Fair Trade escrow web app
After=network.target

[Service]
Type=simple
User=fairtrade
WorkingDirectory=/opt/fairtrade
EnvironmentFile=/etc/fairtrade/.env
Environment=PORT=3000
Environment=HOST=127.0.0.1
ExecStart=/home/fairtrade/.bun/bin/bun run preview --port 3000 --host 127.0.0.1
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fairtrade
sudo systemctl status fairtrade
```

### 4. Nginx reverse proxy

`/etc/nginx/sites-available/fairtrade`

```nginx
server {
    listen 127.0.0.1:8080;
    server_name _;

    # Tor-friendly hardening — no referrers, no third-party fetches
    add_header Referrer-Policy "no-referrer" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://*.supabase.co" always;
    server_tokens off;

    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/fairtrade /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 5. Publish as a Tor hidden service

`/etc/tor/torrc` — append:

```
HiddenServiceDir /var/lib/tor/fairtrade/
HiddenServicePort 80 127.0.0.1:8080
HiddenServiceVersion 3
```

```bash
sudo systemctl restart tor
sudo cat /var/lib/tor/fairtrade/hostname     # your .onion address
```

Open the printed `.onion` in Tor Browser — the site should load through
Nginx → Node → Supabase.

### 6. Back up the onion identity

```bash
sudo tar czf /root/fairtrade-onion-backup.tgz /var/lib/tor/fairtrade
```

Keep this file offline. Restoring it brings the same `.onion` back after a
wipe.

## Admin bootstrap

1. Visit `/auth` and create your admin account.
2. In the Supabase SQL editor run, replacing the email:

   ```sql
   INSERT INTO public.user_roles (user_id, role)
   SELECT id, 'admin' FROM auth.users WHERE email = 'you@example.com';
   ```

3. Reload `/admin`. Add the deposit addresses you control, then flip them
   to **Active** to approve them — only active addresses are shown to
   users on `/check-trade`.

## Security notes

- All sensitive operations (insert, update, delete on crypto_addresses,
  update on trades) are gated server-side by Postgres RLS via the
  `has_role()` security-definer function.
- The `trades_public` view hides password hashes; the base table is
  admin-only for SELECT.
- The trade INSERT policy hard-limits field lengths and value ranges to
  blunt abuse from the open `/start-trade` form.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser. It is only
  loaded by server-side code through the systemd `EnvironmentFile`.
- Tor + Nginx run on `127.0.0.1` only — the box should have no public
  HTTP listener at all. Use `ufw` or `iptables` to enforce.

## Updating

```bash
cd /opt/fairtrade
git pull
bun install
bun run build
sudo systemctl restart fairtrade
```

The `.env` file is untouched by deploys — your Supabase keys persist.