# Ashnight — Setup & Self-Hosting Guide

This guide takes you from a fresh clone to Ashnight running on your own cPanel
server, with your own database, under your total control. No third-party build
platform is required — the app builds and runs with plain Node.js.

---

## 1. What you need

| Piece | Why | Notes |
| --- | --- | --- |
| Node.js 20+ and npm | build & run the app | cPanel: "Setup Node.js App" |
| A PostgreSQL 15+ database | all data | comes with self-hosted Supabase |
| A Supabase-compatible backend | Auth, RLS, Storage, Realtime | self-host with Docker (below) |
| A Paystack account | payments in GHS | keys entered in the admin UI, not in code |
| A domain + SSL | production | cPanel AutoSSL is fine |

The app talks to the backend over HTTPS using three env vars only
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and their server twins), so the
backend can live anywhere: the same cPanel box (if it allows Docker), a VPS you own, or
a managed Supabase project. Nothing is hard-wired.

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
| `npm run build:selfhost` | **standalone Node build** → `.output/` (use this for cPanel/VPS) |
| `npm start` | run the standalone build (`node .output/server/index.mjs`) |
| `npm run lint` / `npm run format` | ESLint / Prettier |

---

## 3. Stand up your own backend (self-hosted Supabase)

On any machine with Docker (a VPS, or your cPanel box if Docker is available):

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
plus SSL. In cPanel you can do this with a subdomain and an Apache proxy rule, or with
Nginx on a VPS.

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

## 4. Deploy on cPanel

### 4.1 Build

Build on your machine (or over SSH on the server — same commands):

```sh
npm ci
npm run build:selfhost
```

Output:

- `.output/server/index.mjs` — the Node SSR server
- `.output/public/` — static assets

### 4.2 Upload

Upload to `/home/<user>/ashnight` (File Manager or `rsync`/Git). You need:

```
ashnight/
  .output/          <- build output (required)
  app.js            <- Passenger startup file (in the repo)
  package.json
  package-lock.json
  .env              <- your production env values
```

`node_modules` is only needed if you build on the server; the standalone build bundles
its own server dependencies.

### 4.3 Register the Node app

cPanel → **Setup Node.js App** → *Create Application*:

| Field | Value |
| --- | --- |
| Node.js version | 20 or newer |
| Application mode | Production |
| Application root | `ashnight` |
| Application URL | `yourdomain.com` |
| Application startup file | `app.js` |

Add environment variables in the same screen (or keep them in `.env`):
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`,
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID`,
`SUPABASE_SERVICE_ROLE_KEY`.

> The `VITE_*` values are baked into the client bundle **at build time**. If you change
> them, rebuild — restarting is not enough.

Click **Restart** after any upload. Then enable AutoSSL for the domain.

### 4.4 Update routine

```sh
git pull
npm ci
npm run build:selfhost
# upload .output/ , then hit Restart in cPanel
```

### 4.5 Alternative: any VPS

```sh
npm ci && npm run build:selfhost
PORT=3000 node .output/server/index.mjs
```

Keep it alive with `pm2 start .output/server/index.mjs --name ashnight` (or a systemd
unit) and put Nginx in front for SSL.

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

---

## 6. Voice & video calls

Chat calls use the browser's native WebRTC APIs (`getUserMedia` / `RTCPeerConnection`).
For calls that work across networks you need a signalling + TURN service. The
recommended option is **LiveKit** (self-hostable, open source):

```sh
docker run --rm -p 7880:7880 -p 7881:7881 -p 50000-60000:50000-60000/udp \
  -e LIVEKIT_KEYS="<api-key>: <api-secret>" livekit/livekit-server
```

Put the server URL, API key and secret into **Keys & security** in the control room.
Calls are additionally gated per room, so you can offer audio-only on Basic and full
video on Ultimate.

---

## 7. Backups & operations

- **Database**: `pg_dump` nightly via cPanel cron, keep copies off-server.
- **Storage**: back up the storage volume alongside the database.
- **Secrets**: `.env` and the key vault are the only places credentials live. Rotate the
  Paystack secret in the control room; rotate the service-role key in your backend.
- **Audit**: every admin action is written to `admin_audit_log` and visible in the
  control room.

---

## 8. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| "Missing Supabase environment variable(s)" | `.env` not loaded, or `VITE_*` values changed without a rebuild |
| Sign-in works locally, fails in production | backend Site URL / redirect allow-list doesn't include your domain |
| 502 from cPanel | app crashed — check the Passenger log in the Node App screen, then Restart |
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
