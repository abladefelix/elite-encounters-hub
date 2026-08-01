# Ashnight

Ashnight is a members-only marketplace for vetted premium **ash (cleaning) specialists**.
Clients pay a membership to enter a room (Basic / Premium / Ultimate), talk to vetted
specialists in real-time chat, book visits, pay through Paystack, and every payment is
held in built-in escrow until the job clears. Specialists join free and earn per booking.

Everything is administered from a private control room at `/ashnight-control`.

- **Stack**: TanStack Start (React 19 + Vite 7 SSR), TypeScript, Tailwind CSS v4, shadcn/ui
- **Backend**: PostgreSQL + Supabase (self-hostable: Auth, Postgres/RLS, Storage, Realtime)
- **Payments**: Paystack (GHS)
- **Currency**: Ghanaian Cedi (GHS) everywhere

## Documentation

| Guide | Who it's for |
| --- | --- |
| [docs/SETUP.md](docs/SETUP.md) | Developers / operators — local dev, self-hosted backend, **Windows deployment (Option A)** and **Linux server deployment** |
| [docs/ADMIN-GUIDE.md](docs/ADMIN-GUIDE.md) | Platform administrators — control room, vetting, rooms, pricing, escrow, moderation, keys |
| [docs/CLIENT-GUIDE.md](docs/CLIENT-GUIDE.md) | Clients (members who book ash services) |
| [docs/SPECIALIST-GUIDE.md](docs/SPECIALIST-GUIDE.md) | Specialists (vetted professionals who earn) |

## Backups

Daily off-site snapshots are built in and **already automated** — a database cron job
(`ashnight-hourly-backup`) pings `POST /api/public/hooks/backup` every hour, and the
endpoint performs the real backup only at the hour selected in **Control room → Backups**,
never twice in the same UTC day. The admin sets the Dropbox and Google Drive accounts on
that same page. Self-hosted installs can instead use the OS scheduler (Task Scheduler /
cron) — see the docs. Snapshots are pruned to the retention count
you choose, and restore steps are documented.

See [docs/SETUP.md § 7](docs/SETUP.md#7-backups--operations--daily-off-site-snapshots-to-dropbox--google-drive)
for the Dropbox/Drive token setup, Windows/Linux/pg_cron schedules and the restore
procedure.

## Quick start (local development)

```sh
git clone <your-repository-url> ashnight
cd ashnight
npm install
cp .env.example .env      # fill in your backend URL + keys
npm run dev               # http://localhost:8080
```

## Quick start (production build for your own server)

```sh
npm ci
npm run build:selfhost    # standalone Node build -> .output/
npm start                 # serves on $PORT (default 3000)
```

## Self-hosting options

Both pieces — the app (plain Node.js) and the backend (Supabase via Docker) — can live on
the same machine. No hosting platform is required.

| Option | Machine | Keep-alive | HTTPS |
| --- | --- | --- | --- |
| **A — Windows (recommended for you)** | Standard Windows 10/11 + Docker Desktop (WSL2) | PM2 with `pm2-windows-startup`, or NSSM service | Cloudflare Tunnel or Caddy |
| **B — Linux server** | Ubuntu 22.04/24.04 or Debian 12 + Docker | `systemd` unit | Caddy (auto-TLS) or Nginx + certbot |

Step-by-step commands for both, plus backend setup, migrations, storage buckets and the
first-admin grant: [docs/SETUP.md](docs/SETUP.md) — section 4 (Windows) and 4b (Linux).


## Project layout

```
src/
  routes/                     file-based routes (URL == filename)
    index.tsx                 landing / discovery
    rooms.tsx                 membership rooms & pricing
    specialists.*             specialist directory + profile
    messages.tsx              realtime chat, calls, booking, gifts, reports, ratings
    profile.tsx               member profile, likes/dislikes, services, 2FA
    apply.tsx                 specialist application (vetting intake)
    auth.tsx                  sign in / sign up / password reset
    ashnight-control*.tsx     PRIVATE admin control room
  lib/                        domain logic (escrow, moderation, gifts, settings, queries)
  components/                 UI + chat components, theme provider, tab bar
  integrations/supabase/      generated database/auth clients (do not hand-edit)
supabase/migrations/          SQL schema, RLS policies and grants (run in order)
docs/                         setup + user guides
```

## Security model in one paragraph

Every table has Row Level Security enabled with explicit grants. Roles live in a
separate `user_roles` table checked by the `has_role()` security-definer function, so
role escalation through a profile update is impossible. Admin-only surfaces are gated
both by RLS and by the `/ashnight-control` route guard. Secrets (Paystack secret key,
call-service credentials) live in the admin key vault and are never shipped to the
browser. Optional TOTP two-factor authentication is available to every account and can
be *required* for admins.

## Note on build tooling

The app code, database schema and docs are vendor-neutral — no editor or hosting SDK is
imported anywhere in `src/`. The only remaining editor-specific pieces are the *build
tooling* used while the project is still developed in the online editor
(`vite.config.ts` and the `@lovable.dev/vite-tanstack-config` devDependency in
`package.json`). Self-hosted builds do not use them: `npm run build:selfhost` uses
`vite.config.selfhost.ts`, which is plain open-source Vite + TanStack Start + Nitro. Once
you no longer edit online, you can delete `vite.config.ts`, drop that devDependency, and
rename `vite.config.selfhost.ts` to `vite.config.ts`.
