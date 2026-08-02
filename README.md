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

## First sign-in (default admin)

Ashnight ships with **no** admin. The first `POST` to `/api/public/bootstrap-admin` creates
one and every later call is refused, so the window closes as soon as the account exists:

```bash
curl -X POST https://your-site/api/public/bootstrap-admin
```

| Field | Value |
| --- | --- |
| Email | `admin@ashnight.app` |
| Username | `ashnight.admin` |
| Password | `AshnightControl2026!` |

1. Sign in on the home page with either the email or the username.
2. Open the private control room at **`/ashnight-control`** (never linked from the site).
3. Go to **Control room → Email & domain → Admin account** and change the email and password
   immediately. Every change is written to the admin audit log.

Extra admins are made in **Control room → Users** — admin is a role in the `user_roles`
table, checked server-side, so it can never be granted from the browser.

## Email verification & sending domain

Email verification is **off by default**: members sign up and are usable at once, which
also means no confirmation mail has to be delivered before the platform works.

- **Control room → Email & domain** holds the switch. Turn it on and any address without a
  confirmed link is refused at sign-in (enforced server-side in `signInWithIdentifier`, not
  in the browser).
- The same page stores the sending domain, mailbox, display name, reply-to address, the
  automated-email switches (welcome / receipts / complaint updates), and how long an
  unverified sign-up keeps its username, email, phone and Ghana Card reserved.
- It prints the **DNS checklist** (SPF, DKIM, DMARC, optional MX) for the domain you type,
  with copy buttons. Add those records at your DNS provider, verify the domain with your
  mail provider, then flip verification on.
- SMTP credentials for a self-hosted mail server live in **Control room → Server & DNS**
  (`smtp_host`, `smtp_port`, `smtp_user`, `smtp_password`, `smtp_from`); pick
  *Transport → My SMTP server* on the Email page to use them.

## Manual deploy sync (GitHub → live server)

**Control room → Deploy** compares the configured GitHub branch with the commit the live
site is running and ships it on a button press. Nothing deploys automatically.

Vault entries (**Control room → Keys & security**):

| Key | Purpose |
| --- | --- |
| `github_repo` | `owner/repository` |
| `github_branch` | branch to track (defaults to `main`) |
| `github_token` | read-only token, only for a private repo |
| `deploy_hook_url` | listener on your server that pulls and rebuilds |
| `deploy_hook_secret` | shared secret; Ashnight signs every request with HMAC-SHA256 in `X-Ashnight-Signature` |

Minimal listener to run on the host (systemd service, port 9099):

```js
// deploy-hook.mjs — node deploy-hook.mjs
import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { execSync } from "node:child_process";

const SECRET = process.env.DEPLOY_HOOK_SECRET;
const DIR = process.env.APP_DIR ?? "/var/www/ashnight";

createServer((req, res) => {
  if (req.method !== "POST") return res.writeHead(405).end();
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const sent = Buffer.from(req.headers["x-ashnight-signature"] ?? "", "utf8");
    const want = Buffer.from(createHmac("sha256", SECRET).update(body).digest("hex"), "utf8");
    if (sent.length !== want.length || !timingSafeEqual(sent, want)) {
      return res.writeHead(401).end("bad signature");
    }
    try {
      const { branch } = JSON.parse(body);
      execSync(`git -C ${DIR} fetch --all && git -C ${DIR} reset --hard origin/${branch}`);
      execSync(`cd ${DIR} && bun install && bun run build`);
      execSync("systemctl restart ashnight");
      res.writeHead(200).end("deployed");
    } catch (error) {
      res.writeHead(500).end(String(error));
    }
  });
}).listen(9099);
```

Point `deploy_hook_url` at `https://your-host:9099/` (or proxy it behind nginx) and set the
same secret in the service environment. Every sync — success or failure — is recorded in
the admin audit log with the commit it shipped.

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


## Finance &amp; accounting (`/ashnight-control/finance`)

Ashnight keeps real double-entry books in the database — no spreadsheets, no simulated figures.

| Table | Holds |
| --- | --- |
| `ledger_accounts` | Chart of accounts (seeded: Paystack cash, bank, MoMo, escrow held, payouts payable, VAT & levies, commission / membership / gift revenue, processing fees, refunds, marketing, payroll, hosting, equity) |
| `journal_entries` / `journal_lines` | Balanced transactions; a database trigger rejects a line that carries both a debit and a credit, or neither |
| `expenses` | Business costs; each one posts its own journal entry automatically |
| `accounting_periods` | Monthly books that can be closed — closed months reject every new posting |

Admin-only via RLS (`is_admin()`); members have no access to any accounting table.

**Tabs**

1. **Statements** — trial balance, income statement (with gross profit and margin), balance sheet
   (cumulative, with retained earnings rolled in), direct-method cash flow across all `cash`
   accounts, and the Ghana VAT + NHIL/GETFund/COVID levy position. Every statement respects the
   date range at the top of the page and exports to CSV.
2. **Journal** — every entry with its lines, plus **Sync from platform activity**: books each
   escrow payment (Paystack cash debited, escrow liability and commission revenue credited), each
   released payout and each refund. It is idempotent — entries are tagged with `source` +
   `source_id`, so re-running only books what is missing. Manual entries are validated to balance
   before they post, and can be saved as drafts, posted or voided.
3. **Chart of accounts** — add, edit, deactivate or delete accounts. Use subtype `cash` so an
   account appears in the cash-flow statement and `cogs` so it reduces gross profit. System
   accounts are wired into the automatic postings and can't be deleted.
4. **Expenses** — record a cost with vendor, category, recoverable VAT, funding account and
   receipt reference; the matching journal entry is posted and removed with it. Choose *Accounts
   payable* as the funding account for supplier invoices not yet paid.
5. **Close &amp; settings** — open or close monthly periods, and set VAT rate, levy rate,
   withholding rate, financial-year start, registered name and GRA TIN.

Statutory rates default to Ghana's current standard: **15% VAT**, **6% combined levies**, **7.5%
withholding** on service payouts. Change them in Close &amp; settings whenever the law changes —
no code edit needed.

Every finance surface — trial balance, income statement, general journal, chart of accounts and
expenses — has an **Export** button covering CSV, Excel, PDF and Word.

## Admin roles &amp; permissions (`/ashnight-control/admins`)

Ashnight has two admin tiers:

- **Super admin** — full access to everything, including this page. Super admins decide what every
  other admin may do and can never be limited themselves.
- **Scoped admin** — sees only the control-room areas a super admin ticked, and can optionally be
  set to **View only** (reads without saving) or have **exports withheld**.

The roster on this page lists every account with the `admin` role; promote a member from
**Users → Edit everything → Roles** first and they appear here. Permissions live in the
`admin_permissions` table and are mirrored in the database through `is_super_admin()`, so the
sidebar gate is never the only line of defence. Safety net: while no super-admin record exists at
all, every admin is treated as a super admin so the platform can't lock its owners out.

Areas are grouped as Operations, Money, Trust &amp; safety and Platform, matching the sidebar.

## Exports everywhere (CSV, Excel, PDF, Word)

`src/lib/exporters.ts` provides one export pipeline for the whole control room, and
`src/components/admin/export-menu.tsx` drops it beside any table:

```tsx
<ExportMenu
  filename="ashnight-members"
  title="Members"
  columns={[{ label: "Name", value: (row) => row.display_name }]}
  rows={rows}
/>
```

- **CSV** — plain data, UTF-8 with BOM so Excel opens Ghanaian names correctly.
- **Excel (.xlsx)** — formatted worksheet with the report title.
- **PDF** — print-ready landscape report with headings and page numbers.
- **Word (.doc)** — editable document for reports and board packs.

Heavy libraries (`xlsx`, `jspdf`) load on demand, so the control room stays light until someone
actually exports. The menu hides itself for admins whose permissions withhold exports, and exports
always cover the **filtered** rows in view — not just the current page.

Live today on: members, bookings &amp; payouts, activity log, admin permissions and every finance
statement.

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

## Payments, escrow and moderation are server-side

Checkouts are started by server functions that recalculate the amount from database state,
then create a real Paystack transaction using the secret key from the admin vault. Money
only becomes "held" when the signed Paystack webhook (or the member's verified return trip)
confirms the charge. Escrow rows are insert/update-locked to the server and admins, so no
member can self-approve a payout or edit a price after payment. Chat moderation runs as a
database trigger using the admin's own rules, so contact details are blocked even if a
client is bypassed. Deposits are settled by the scheduled
`/api/public/hooks/escrow-release` pass — see [docs/SETUP.md](docs/SETUP.md) §5a.

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
