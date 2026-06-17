# OVAL — VPS Deployment Guide

Deploys the dashboard + live Play Store puller to a Hostinger VPS (Ubuntu 24.04),
always-on, behind the login gate, on your own domain with HTTPS.

## 0. Buy
- Hostinger **VPS — KVM 2** (2 vCPU / 8 GB), OS **Ubuntu 24.04 LTS**, region **Mumbai**
- A domain (Hostinger or elsewhere)

## 1. Base setup (as root)
```bash
apt update && apt -y upgrade
# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt -y install nodejs
# Python + pip
apt -y install python3 python3-pip git nginx
# pm2
npm i -g pm2
```

## 2. Get the code + secrets
```bash
git clone <repo-url> /opt/oval && cd /opt/oval
pip3 install -r requirements.txt
cd oval && npm ci && cd ..
```
Copy the secrets **manually** (never via git) from your Mac:
```bash
# from your Mac:
scp secrets/playstore-service-account.json root@SERVER_IP:/opt/oval/secrets/
scp oval/.env.local root@SERVER_IP:/opt/oval/oval/.env.local
```
`oval/.env.local` must contain: `PLAYSTORE_ONLY=true`, `ACCESS_PASSWORD=...`,
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SLACK_BOT_TOKEN`,
`PLAYSTORE_SLACK_CHANNEL_ID`, and `PLAYSTORE_SLACK_TRIGGER_TOKEN`.

## 3. Build + run
```bash
cd /opt/oval/oval && npm run build && cd /opt/oval
pm2 start ecosystem.config.js
pm2 save && pm2 startup   # survives reboots
```

## 4. Domain + HTTPS (nginx reverse proxy)
Point an A-record for your domain at the VPS IP, then:
```bash
# /etc/nginx/sites-available/oval  -> proxy_pass http://localhost:3000
apt -y install certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com   # free SSL, auto-renew
```

## 5. Firewall
```bash
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
```

## Updating later
```bash
cd /opt/oval && git pull && cd oval && npm ci && npm run build && cd .. && pm2 reload all
```

## Notes
- The Play Developer API key is **not IP-bound** — the puller works from the VPS unchanged.
- For horizontal scale later: move live reviews from the JSON file into Supabase/Postgres
  and run `oval-web` in pm2 cluster mode.
