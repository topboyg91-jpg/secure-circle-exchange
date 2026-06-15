# Fair Trade — Kali deployment

Pure static Vite + React build. No Node runtime at serve time — Nginx serves
`dist/` directly, and a Tor v3 hidden service proxies to the same Nginx.

## Deploy

```bash
sudo ./deploy.sh
```

The script is idempotent: re-run after editing the project to rebuild and
republish. It will:

1. install missing packages (`nginx`, `tor`, `nodejs 20`)
2. install JS deps and run `vite build` (auto-retries on failure)
3. publish `dist/` to `/var/www/fairtrade`
4. write `/etc/nginx/sites-available/fairtrade` and enable it
5. inject a v3 hidden-service block into `/etc/tor/torrc`
6. free ports 80, 8080, 9050, 9051 if anything else holds them
7. start/reload `nginx` and `tor`
8. print the local, LAN, and `.onion` URLs

## Where things live

| Path                                  | Purpose                          |
| ------------------------------------- | -------------------------------- |
| `/var/www/fairtrade/`                 | served static files              |
| `/etc/nginx/sites-available/fairtrade`| Nginx vhost                      |
| `/etc/tor/torrc`                      | Tor config (block is bracketed)  |
| `/var/lib/tor/fairtrade/hostname`     | the `.onion` address             |

## Useful commands

```bash
sudo cat /var/lib/tor/fairtrade/hostname   # show onion address
sudo systemctl status nginx tor            # service status
sudo journalctl -u nginx -f                # nginx logs
sudo journalctl -u tor -f                  # tor logs
```