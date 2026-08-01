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

## Media sharing & admin switches

Everything below is toggled live in **Control room → Features** (no deploy needed) and every
change is written to the admin audit log.

### Phone numbers in chat

Members **cannot** share phone numbers — this is on by default and set to **Block send**, so
the message never leaves the composer. It has its own switch, separate from other contact
details, in **Control room → Moderation → Rules**:

| Control | Default | Effect |
| --- | --- | --- |
| `Prevent phone numbers` | **On** | Master switch for phone-number detection |
| Action next to it | **Block send** | Or `Mask it` (delivered with digits redacted) or `Warn only` |
| `Prevent other contact sharing` | On / Mask | Emails, external links and social handles |
| Room exemptions | none | Per-tier override that lets a room exchange contacts anyway |

Detection covers plain digits, spaced/dashed/bracketed numbers (`024 412 3456`, `+233…`),
spelled-out digits (`zero two four one two three…`) and messenger handoffs
(`WhatsApp me 020…`, `telegram: @handle`). Every hit is written to the review log at
**Control room → Moderation** when `Log hits for review` is on, and the member sees a system
note in the thread when `Tell the member` is on. Turning the switch off restores phone sharing
immediately, with no deploy.

### One-to-one chat attachments

Yes — members can attach images and files inside a thread. Three layers must all agree before
the paperclip and photo buttons appear:

| Layer | Where | Effect |
| --- | --- | --- |
| `Chat attachments` | Control room → Features | Master switch for **all** attachments (photos *and* files) |
| `Chat image sharing` | Control room → Features | Photos only — turn images off while keeping documents on |
| Room privileges `photoSharing` / `fileSharing` | Control room → Rooms | Per-tier (basic / premium / ultimate) allowance |

Images sent in chat render as inline previews; other files show as a named download link.
Uploads land in the private `attachments` bucket under the uploader's own folder
(`<user-id>/<thread-id>/…`) and are served through short-lived signed URLs — nothing is public.
Turning a switch off takes effect on the next message send for everyone, and existing
attachments stay readable to the two thread members and admins.

### Specialist portfolio at sign-up

| Switch | Effect |
| --- | --- |
| `Specialist portfolio uploads` | Shows the photo + video picker on the specialist sign-up form |

Specialists can attach **up to 6 work photos** (8MB each) and **one intro video** (60MB max)
while creating their account. Files upload only after the account has a session, into
`attachments/<user-id>/portfolio/…`, and the stored paths are recorded on the specialist's
profile (`profiles.extra.portfolio_photos` / `portfolio_video`) so vetting can review them
before assigning a room.

### Continue with Google

| Switch | Default | Effect |
| --- | --- | --- |
| `Continue with Google` | **Off** | Shows/hides the Google button on both the sign-in and sign-up tabs |

Google sign-in is optional and **hidden by default** — email and password is the only visible
route until an admin enables it. Enable the Google provider on the backend auth settings before
switching it on, otherwise the first attempt errors.

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
