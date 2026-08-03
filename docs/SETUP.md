# Ashnight — Setup & Self-Hosting Guide

This guide takes you from a fresh clone to Ashnight running on a machine you own —
**Windows (Option A, section 4)** or a **Linux server (Option B, section 4b)** — with your
own database, under your total control. No third-party build or hosting platform is
required: the app builds and runs with plain Node.js.

---

## 1. What you need

| Piece | Why | Notes |
| --- | --- | --- |
| Node.js 20+ and npm | build & run the app | Windows installer or NodeSource on Linux |
| Docker | runs the backend stack | Docker Desktop (WSL2) on Windows, Docker Engine on Linux |
| A PostgreSQL 15+ database | all data | comes with the self-hosted backend stack |
| A Supabase-compatible backend | Auth, RLS, Storage, Realtime | self-host with Docker (below) |
| A Paystack account | payments in GHS | keys entered in the admin UI, not in code |
| A domain + SSL | production | Cloudflare Tunnel or Caddy gives you free TLS |

The app talks to the backend using three env vars only
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and their server twins), so the
backend can live anywhere: the same machine as the app (recommended), another server you
own, or a managed Supabase project. Nothing is hard-wired.


---

## 2. Local development

```sh
git clone <your-repository-url> ashnight
cd ashnight
npm install
cp .env.example .env        # fill in your backend URL + keys
npm run dev                 # http://localhost:8080
```

Scripts:

| Script | What it does |
| --- | --- |
| `npm run dev` | dev server with HMR on port 8080 |
| `npm run build:selfhost` | **standalone Node build** → `.output/` (use this to run on your own server) |
| `npm start` | run the standalone build (`node .output/server/index.mjs`) |
| `npm run lint` / `npm run format` | ESLint / Prettier |

---

## 3. Stand up your own backend (self-hosted Supabase)

On any machine with Docker (your Windows PC via Docker Desktop, or a Linux server):

```sh
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
# EDIT .env: set POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY,
# SITE_URL=https://yourdomain.com, API_EXTERNAL_URL=https://api.yourdomain.com,
# SMTP_* for auth emails, and DISABLE_SIGNUP=false
docker compose up -d
```

Then put the API behind your own hostname (`api.yourdomain.com`) with a reverse proxy
plus SSL (Caddy, Nginx or a Cloudflare Tunnel). If the app and backend share one machine
and you are not exposing the API publicly, `http://localhost:8000` is enough.

### 3.1 Apply the schema

All schema, RLS policies, grants, triggers and seed data live in
`supabase/migrations/*.sql`. Apply them **in filename order**:

```sh
for f in supabase/migrations/*.sql; do
  psql "postgresql://postgres:<password>@<db-host>:5432/postgres" -v ON_ERROR_STOP=1 -f "$f"
done
```

What that creates:

- `profiles`, `user_roles`, `applications` — accounts, roles, vetting intake
- `services`, `specialist_services` — admin-owned service catalogue
- `threads`, `messages` — realtime chat
- `bookings`, `escrow_entries` — visits and the escrow ledger
- `memberships` — client room subscriptions
- `moderation_hits`, `reports`, `ratings` — safety and trust
- `platform_settings`, `integration_keys`, `admin_audit_log` — admin control plane

### 3.2 Storage buckets

Create two **private** buckets in your backend: `avatars` and `attachments`.
Profile photos and chat attachments are served through signed URLs.

### 3.3 Auth configuration

- Email/password: enabled.
- Google sign-in (optional): create a Google OAuth client, add
  `https://api.yourdomain.com/auth/v1/callback` as the redirect URI, and paste the
  client ID/secret into your backend's Google auth provider settings.
- Set Site URL to `https://yourdomain.com` and add `https://yourdomain.com/reset-password`
  to the allowed redirect list.
- Leave "confirm email" on for production.

### 3.4 Create the first admin

Sign up through the app, then grant yourself the admin role once, directly in SQL:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'you@yourdomain.com'
on conflict do nothing;
```

Sign out and back in — `/ashnight-control` is now available to you.

---

## 4. Deploy — Option A: everything on one Windows machine

This is the recommended path: app **and** backend run on the same standard Windows PC
(Windows 10/11 is fine — Windows Server is not required).

### 4.0 Prerequisites

Install, in this order:

1. **Node.js 20 LTS or newer** — https://nodejs.org (check "Add to PATH").
2. **Git for Windows** — https://git-scm.com/download/win
3. **Docker Desktop** with the **WSL2 backend** — needed for the Supabase stack
   (Settings → General → "Use WSL 2 based engine"). Enable
   Settings → General → "Start Docker Desktop when you log in".

Verify in PowerShell:

```powershell
node -v
git --version
docker version
```

### 4.1 Backend on the same machine

Follow **section 3** in this file, but run the Docker commands from PowerShell:

```powershell
cd C:\ashnight
git clone --depth 1 https://github.com/supabase/supabase supabase-src
cd supabase-src\docker
Copy-Item .env.example .env
notepad .env          # set POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY, SITE_URL...
docker compose up -d
```

Then apply the migrations (section 3.1), create the `avatars` and `attachments` private
buckets (3.2), configure auth URLs (3.3) and grant yourself admin (3.4).

Because everything is local, the app talks to the backend over
`http://localhost:8000` (Kong). If you expose the site publicly, set
`SITE_URL` / `API_EXTERNAL_URL` to your public HTTPS hostname instead — the
browser must be able to reach the API URL you put in `VITE_SUPABASE_URL`.

### 4.2 Build and run the app

```powershell
cd C:\ashnight\app
git clone <your-repo-url> .
npm ci
Copy-Item .env.example .env
notepad .env          # VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY / SUPABASE_* / SERVICE_ROLE
npm run build:selfhost
$env:PORT=3000; node .output\server\index.mjs
```

Open `http://localhost:3000`. That's the whole app.

> The `VITE_*` values are baked into the client bundle **at build time**. If you change
> them, rebuild — restarting is not enough.

### 4.3 Keep it running as a Windows service

Use PM2 (simplest) so it survives reboots and crashes:

```powershell
npm install -g pm2 pm2-windows-startup
pm2-startup install
pm2 start C:\ashnight\app\.output\server\index.mjs --name ashnight --env production
pm2 save
pm2 logs ashnight        # tail logs
pm2 restart ashnight     # after a rebuild
```

Alternative: **NSSM** (https://nssm.cc) if you prefer a native service entry:

```powershell
nssm install Ashnight "C:\Program Files\nodejs\node.exe" "C:\ashnight\app\.output\server\index.mjs"
nssm set Ashnight AppDirectory C:\ashnight\app
nssm set Ashnight AppEnvironmentExtra PORT=3000 NODE_ENV=production
nssm start Ashnight
```

### 4.4 Public access + HTTPS

Pick one:

- **Cloudflare Tunnel (easiest, no open ports, free SSL)**
  ```powershell
  winget install --id Cloudflare.cloudflared
  cloudflared tunnel login
  cloudflared tunnel create ashnight
  cloudflared tunnel route dns ashnight yourdomain.com
  cloudflared tunnel run --url http://localhost:3000 ashnight
  cloudflared service install    # run it on boot
  ```
- **Caddy reverse proxy** (needs ports 80/443 forwarded to the machine):
  `Caddyfile` → `yourdomain.com { reverse_proxy localhost:3000 }` then
  `caddy run` — Caddy fetches the certificate automatically.

Also allow the port through Windows Firewall if you serve directly:

```powershell
New-NetFirewallRule -DisplayName "Ashnight" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

### 4.5 Update routine (Windows)

```powershell
cd C:\ashnight\app
git pull
npm ci
npm run build:selfhost
pm2 restart ashnight
```

Backend updates: `cd C:\ashnight\supabase-src\docker; docker compose pull; docker compose up -d`.

---

## 4b. Option B: Linux server (for future reference)

Ubuntu 22.04/24.04 or Debian 12. Same two pieces, nicer tooling.

### 4b.1 Base packages

```sh
sudo apt update && sudo apt install -y git curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
```

### 4b.2 Backend

```sh
git clone --depth 1 https://github.com/supabase/supabase ~/supabase-src
cd ~/supabase-src/docker && cp .env.example .env
nano .env            # same values as section 3
docker compose up -d
```

Apply migrations, buckets, auth config and the admin grant exactly as in section 3.

### 4b.3 App

```sh
git clone <your-repo-url> /srv/ashnight && cd /srv/ashnight
npm ci
cp .env.example .env && nano .env
npm run build:selfhost
```

Run it under systemd — `/etc/systemd/system/ashnight.service`:

```ini
[Unit]
Description=Ashnight
After=network.target docker.service

[Service]
Type=simple
WorkingDirectory=/srv/ashnight
EnvironmentFile=/srv/ashnight/.env
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node /srv/ashnight/.output/server/index.mjs
Restart=always
RestartSec=3
User=www-data

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now ashnight
sudo journalctl -u ashnight -f
```

### 4b.4 HTTPS with Caddy

```sh
sudo apt install -y caddy
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
yourdomain.com {
  reverse_proxy localhost:3000
}
EOF
sudo systemctl reload caddy
```

(Nginx + certbot works equally well; proxy `/` to `localhost:3000` and pass
`Upgrade`/`Connection` headers so realtime websockets work.)

### 4b.5 Update routine (Linux)

```sh
cd /srv/ashnight && git pull && npm ci && npm run build:selfhost
sudo systemctl restart ashnight
```


---

## 5. Post-deploy configuration (done in the app, not in code)

Sign in as admin and open `/ashnight-control`:

1. **Keys & security** → paste your Paystack public + secret keys and (optionally) your
   call-service credentials. They're stored in the database so you can rotate them any
   time without touching code or redeploying.
2. **Rooms** → set membership prices, visit-fee ranges, platform commission, per-room
   privileges (calls, video, attachments, booking limits, SLAs) and accent colours.
3. **Services** → create the ash service catalogue specialists choose from.
4. **Escrow** → set the hold window, gift cash values, tip commission and tip ceiling.
5. **Moderation** → flagged words, contact-sharing block, per-room exemptions.
6. **Features** → master switches: maintenance mode, sign-ups, applications, calls,
   gifts, attachments, bookings, 2FA availability, required admin 2FA, audit logging.
7. **Default theme** → choose the theme new visitors get (they can still switch).

### 5a. Wire Paystack and escrow settlement

Both URLs are shown with copy buttons in **Control room → Escrow & gifts → Payments &
automation**.

1. **Webhook**: in Paystack → *Settings → API Keys & Webhooks*, set the webhook URL to
   `https://<your-domain>/api/public/hooks/paystack`. Ashnight verifies every call with
   HMAC-SHA512 against your secret key, so an unsigned request can never move money.
2. **Settlement pass**: call
   `https://<your-domain>/api/public/hooks/escrow-release` hourly. It starts the clearing
   countdown for visits the member never confirmed and deposits anything whose hold
   window elapsed with no issue raised. Admins can also press **Run settlement now**.

```bash
# Linux cron, hourly
0 * * * * curl -fsS -X POST https://your-domain/api/public/hooks/escrow-release \
  -H "apikey: <your publishable key>" >/dev/null
```

Amounts are always recalculated server-side from the database (visit fee × hours, add-ons,
room pricing, commission) — the browser never tells the server what to charge.

---

## 6. Voice & video calls

Ashnight has two call engines and chooses automatically:

1. **LiveKit (recommended).** As soon as `livekit_url`, `livekit_api_key` and
   `livekit_api_secret` are saved in **Keys & security**, calls run through the
   LiveKit SDK (`livekit-client`) against LiveKit's SFU/TURN relay. This is what makes
   calls connect on mobile data and behind strict firewalls. Use LiveKit Cloud (the free
   tier is enough to start) or self-host:

   ```sh
   docker run --rm -p 7880:7880 -p 7881:7881 -p 50000-60000:50000-60000/udp \
     -e LIVEKIT_KEYS="<api-key>: <api-secret>" livekit/livekit-server
   ```

2. **Direct peer-to-peer fallback.** With no LiveKit credentials, the app falls back to
   raw WebRTC with public STUN only — fine on friendly networks, unreliable on mobile
   carriers.

Join tokens are minted server-side (`src/lib/livekit.functions.ts`), scoped to the single
chat thread, and only after the server confirms the caller is a participant of that
thread. The API secret never reaches the browser, and tokens expire after one hour.
Calls are additionally gated per room, so you can offer audio-only on Basic and full
video on Ultimate.


---

## 7. Backups & operations — daily off-site snapshots to Dropbox + Google Drive

Ashnight ships an automated backup pipeline. A single endpoint dumps every public table
(and, optionally, the storage object index) into one JSON snapshot and uploads it to the
Dropbox and/or Google Drive account you configure in the control room. Old snapshots are
pruned automatically so each destination keeps only the number of copies you allow.

Endpoint: `POST /api/public/hooks/backup`
Control room page: **Backups** (`/ashnight-control/backups`)

### 7.1 Create the Dropbox account/app

1. Go to <https://www.dropbox.com/developers/apps> → **Create app** → *Scoped access* →
   *App folder* (recommended) or *Full Dropbox*.
2. **Permissions** tab: enable `files.content.write`, `files.content.read`,
   `files.metadata.read`. Submit.
3. **Settings** tab: copy the **App key** and **App secret**.
4. Get an offline refresh token (once, from any browser + terminal):

```sh
# 1. Open this URL, approve, and copy the ?code= value it returns
https://www.dropbox.com/oauth2/authorize?client_id=<APP_KEY>&response_type=code&token_access_type=offline

# 2. Exchange the code for a refresh token
curl -u "<APP_KEY>:<APP_SECRET>" \
  -d grant_type=authorization_code -d code=<CODE> \
  https://api.dropbox.com/oauth2/token
# -> { "access_token": "...", "refresh_token": "sl.u...." }
```

5. In **Control room → Backups → Dropbox account**, paste the App key, App secret and
   Refresh token, set the folder path (e.g. `/ashnight-backups`), label the account and
   turn **Back up to Dropbox** on.

### 7.2 Create the Google Drive account/client

1. <https://console.cloud.google.com/> → new project → **APIs & Services → Library** →
   enable **Google Drive API**.
2. **OAuth consent screen**: External, add your admin Google account as a test user.
3. **Credentials → Create credentials → OAuth client ID → Web application**. Add
   `https://developers.google.com/oauthplayground` as an authorised redirect URI. Copy the
   **Client ID** and **Client secret**.
4. Get an offline refresh token with the OAuth Playground:
   - Open <https://developers.google.com/oauthplayground>
   - Gear icon → *Use your own OAuth credentials* → paste client ID + secret
   - Scope: `https://www.googleapis.com/auth/drive.file` → Authorize → **Exchange
     authorization code for tokens** → copy the **refresh token**
5. (Optional) Create a Drive folder for backups and copy its ID from the URL
   (`drive.google.com/drive/folders/<FOLDER_ID>`).
6. In **Control room → Backups → Google Drive account**, paste the client ID, client
   secret and refresh token, set the folder ID, label the account and turn **Back up to
   Google Drive** on.

### 7.3 Turn the schedule on

In **Control room → Backups**: enable **Scheduled backups**, choose the run hour (UTC),
set how many snapshots to keep per destination, then press **Run backup now** once to
verify both destinations report `uploaded`.

### 7.4 Automation (already on)

Automation ships enabled: a database cron job named `ashnight-hourly-backup` calls the
endpoint at five past every hour. The endpoint itself decides whether to act — it runs a
real backup only when the current UTC hour equals the **run hour** you picked in the
control room, and skips if a snapshot already ran that day. So changing the hour in the
admin UI is enough; nothing needs rescheduling.

Inspect or change it:

```sql
select jobname, schedule, active from cron.job;                 -- list jobs
select * from cron.job_run_details order by start_time desc limit 20;  -- history
select cron.unschedule('ashnight-hourly-backup');               -- turn automation off
```

Pressing **Run backup now** in the control room bypasses the hour/once-a-day gates
(`{"force":true}`).

### 7.4b Alternative: schedule it from the OS (self-hosted)

Any scheduler can call the endpoint — it only needs the project publishable key in an
`apikey` header.

**Windows (Task Scheduler / PowerShell), daily at 02:00:**

```powershell
$body = '{"force":false}'
Invoke-RestMethod -Method Post -Uri "https://yourdomain.com/api/public/hooks/backup" `
  -Headers @{ "apikey" = "<YOUR_PUBLISHABLE_KEY>"; "Content-Type" = "application/json" } `
  -Body $body
```

Save as `C:\ashnight\backup.ps1`, then:

```powershell
schtasks /Create /TN "Ashnight backup" /SC DAILY /ST 02:00 `
  /TR "powershell -ExecutionPolicy Bypass -File C:\ashnight\backup.ps1"
```

**Linux (cron), daily at 02:00:**

```sh
0 2 * * * curl -s -X POST https://yourdomain.com/api/public/hooks/backup \
  -H "apikey: <YOUR_PUBLISHABLE_KEY>" -H "Content-Type: application/json" -d '{}'
```

**Postgres (pg_cron), if you prefer the database to drive it:**

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('ashnight-daily-backup', '0 2 * * *', $$
  select net.http_post(
    url := 'https://yourdomain.com/api/public/hooks/backup',
    headers := '{"Content-Type":"application/json","apikey":"<YOUR_PUBLISHABLE_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
```

### 7.5 Restoring from a snapshot

1. Download the newest `ashnight-backup-<timestamp>.json` from Dropbox or Drive.
2. Stand up a clean backend and apply `supabase/migrations/*.sql` in filename order.
3. Load the snapshot table by table (order matters because of foreign keys):
   `profiles`, `user_roles`, `services`, `specialist_services`, `applications`,
   `threads`, `messages`, `bookings`, `escrow_entries`, `memberships`, `ratings`,
   `reports`, `moderation_hits`, `platform_settings`, `integration_keys`,
   `admin_audit_log`.

```sh
# example: restore one table with jq + psql (repeat per table, in the order above)
jq -c '.data.profiles[]' ashnight-backup-*.json | while read -r row; do
  psql "$DATABASE_URL" -c "insert into public.profiles select * from jsonb_populate_record(null::public.profiles, '$row') on conflict (id) do nothing;"
done
```

4. Storage files (avatars/attachments) are **not** inside the JSON — only their index is.
   Back up the storage volume separately (see below) and copy it back into place.

### 7.6 Belt-and-braces extras

- **Full SQL dump** (schema + data, best for a like-for-like restore):
  `docker exec -t supabase-db pg_dump -U postgres postgres > backup.sql` — schedule this
  alongside the JSON snapshot and keep it off-machine.
- **Storage volume**: back up the Supabase storage volume (or `volumes/storage`) with the
  database so uploaded avatars and attachments survive a rebuild.
- **Code**: your Git remote is the code backup — keep pushing.
- **Secrets**: `.env` plus the control-room key vault are the only places credentials
  live. The vault is included in the JSON snapshot, so treat snapshots as secrets.
- **Audit**: every admin action is written to `admin_audit_log` and visible in the
  control room.

---

## 8. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| "Missing Supabase environment variable(s)" | `.env` not loaded, or `VITE_*` values changed without a rebuild |
| Sign-in works locally, fails in production | backend Site URL / redirect allow-list doesn't include your domain |
| 502 / blank page behind the proxy | app process died — `pm2 logs ashnight` (Windows) or `journalctl -u ashnight -f` (Linux) |
| Data reads return "permission denied" | migrations partly applied; re-run them so `GRANT`s and policies exist |
| Chat doesn't update live | Realtime not enabled/reachable on your backend, or WebSockets blocked by the proxy |
| Google sign-in "Unsupported provider" | Google provider not enabled in your backend auth settings |

---

## 9. Ownership notes

- The codebase is plain TypeScript/React with no proprietary runtime.
- `vite.config.selfhost.ts` is the config used for self-hosted builds; it uses only
  open-source Vite plugins.
- `src/integrations/supabase/*.ts` are generated database clients — they read your env
  vars and are safe to keep as-is; regenerate or hand-maintain them if you change
  backends.
