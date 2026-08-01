# Ashnight — Administrator Guide

The control room lives at a private URL:

```
https://yourdomain.com/ashnight-control
```

It is never linked from the public site, is gated by the `admin` role in the
`user_roles` table, and deliberately uses a desktop admin layout (no mobile app shell).

---

## 1. Access & security

- **Getting in**: you need an account whose role is `admin`. The first admin is created
  in SQL once (see docs/SETUP.md §3.4); after that you can grant the role from
  **Users**.
- **Two-factor**: enrol a TOTP authenticator from the control room. If you switch on
  *Require 2FA for admins* under **Features**, every admin must enrol before they can
  use the control room.
- **Audit log**: every admin action (vetting decision, price change, escrow release,
  key update, suspension) is recorded with who, what, when — visible on the dashboard.

---

## 2. Dashboard (`/ashnight-control`)

At-a-glance metrics: pending vetting applications, active members per room, open
disputes, funds currently held in escrow, bookings today, moderation hits awaiting
review, and the latest audit entries. Use it as your daily triage list.

---

## 3. Vetting (`/ashnight-control/vetting`)

Every account is manually vetted before it can transact.

1. Open a pending application. You see the applicant's details, experience, pitch,
   ID-verification flag, background-check state and reference-check count.
2. Decide: **Approve**, **Reject**, or move to **In review** with an internal note.
3. On approval, assign the **room** (Basic / Premium / Ultimate). For specialists this
   is your editorial decision. For clients the room follows their paid membership, but
   you can still override it.

Approving sets `profiles.vetting = approved`, which is what makes a specialist visible
in the directory. Rejections keep the record for your audit trail.

---

## 4. Users (`/ashnight-control/users`)

Search and filter every account. Per user you can:

- edit display name, city, headline, bio, languages, hourly rate, experience
- toggle **verified**, **available**, and **suspended**
- change room assignment and vetting status
- grant or revoke the `admin`, `specialist`, `client` roles
- open their threads for a moderation context read

Suspension is immediate: the account keeps its data but cannot message, book, or be
booked.

---

## 5. Rooms, pricing & privileges (`/ashnight-control/rooms`)

Everything about a tier is editable here — nothing is hard-coded.

- **Membership price** (GHS) that clients pay to join the room
- **Visit fee range** — the min/max hourly rate specialists in this room may charge
- **Platform commission** — your percentage of each booking
- **Privileges** per room: voice calls, video calls, file attachments, monthly booking
  limit, response-time SLA, priority support
- **Accent colour** and room label used across badges and cards
- **Default theme** for the whole platform (members can still choose their own)

Changes save to `platform_settings` and take effect immediately for every member.

---

## 6. Services catalogue (`/ashnight-control/services`)

The service list specialists pick from at registration is admin-owned:

- create / rename / describe a service, set its category
- set a **suggested base rate** in GHS
- set sort order, and activate or deactivate a service (deactivating hides it from new
  selections without breaking historical bookings)

---

## 7. Bookings (`/ashnight-control/bookings`)

Full ledger of requested → accepted → paid → completed → cancelled/disputed visits.
You can inspect a booking's hours, rate, add-ons, notes, the fee applied, and jump to
its escrow entry or chat thread.

---

## 8. Escrow (`/ashnight-control/escrow`)

Ashnight never pays a specialist instantly. Money flows:

```
client pays  ->  held  ->  clearing (hold window running)  ->  released  ->  payout
                   |
                   +--> disputed (client raised an issue)  ->  released or refunded
```

Controls here:

- **Hold window** (hours) before funds auto-release when no issue is raised
- **Force release** / **Refund** an entry, with a mandatory admin note
- **Dispute queue** — read the reason, the thread excerpt, then resolve
- **Gift cash values** per room, **tip commission**, and **maximum tip**
- Totals: held, clearing, released, refunded, and platform earnings

Every manual action is audit-logged.

---

## 9. Moderation & trust (`/ashnight-control/moderation`)

- **Flagged words** — list of terms that block or mask a message
- **Contact blocking** — stops phone numbers, emails, social handles and messaging-app
  usernames from being shared, keeping deals on-platform
- **Room exemptions** — allow a specific thread or room to exchange contact details
- **Hits log** — every blocked/masked message with the original text for review
- **Reports** — user-submitted reports (open → reviewing → actioned → dismissed) with
  notes, block option and thread excerpt
- **Ratings feed** — star ratings and tags left in chat, so you can spot patterns

---

## 10. Features & kill-switches (`/ashnight-control/features`)

Master switches you can flip at any time without a deploy:

| Switch | Effect |
| --- | --- |
| Maintenance mode | Site-wide banner; member actions paused |
| Sign-ups | Open/close new account creation |
| Specialist applications | Open/close the vetting intake |
| Voice calls / Video calls | Global kill-switch above per-room privileges |
| Gifts / Tips | Enable or disable in-chat gifting |
| Attachments | Enable or disable file sharing in chat |
| Bookings | Pause all new booking requests |
| 2FA available | Let members enrol TOTP |
| Require 2FA for admins | Force admin enrolment |
| Audit logging | Record admin actions |

---

## 11. Keys & security (`/ashnight-control/settings`)

The key vault. Store and rotate credentials without a redeploy:

- **Paystack** public key (mirrored to the client at runtime) and secret key (masked,
  server-side only)
- **Call service** (e.g. LiveKit) URL, API key and secret
- Any future integration key you add — the vault is generic, with label, description,
  secret flag and last-updated-by

Secrets are never sent to the browser; only values explicitly marked public are mirrored
into runtime settings.

---

## 12. Recommended routine

- **Daily**: vetting queue, dispute queue, moderation hits, reports.
- **Weekly**: escrow totals vs Paystack settlements; ratings for quality drift.
- **Monthly**: review room pricing and commission; rotate the Paystack secret; verify
  database backups restore.
