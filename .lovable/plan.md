## Goal

Right now every part of Ashnight is a convincing front-end simulation: users come from `src/lib/mock-data.ts`, chat/escrow/gifts/moderation/reports live in browser localStorage, calls only show your own camera, and Paystack references are generated locally. Nothing is shared between two real people.

This plan replaces all of it with real infrastructure — and keeps it portable, because Lovable Cloud is Postgres + the open-source Supabase stack. Everything I write (SQL migrations, RLS policies, auth, storage buckets, server code) runs unchanged on a self-hosted Supabase instance on your own server. Nothing here locks you in.

## Phase 1 — Database + auth (the foundation)

Real accounts, real records, real permissions.

- Sign-up / sign-in (email + password, plus Google), password reset.
- `profiles`, `user_roles` (separate table — never roles on the profile, that's a privilege-escalation hole), `applicants`, `services`, `specialist_services`, `rooms`, `memberships`, `bookings`.
- Profile photo upload into real file storage, replacing the browser-only image.
- Row-level security on every table: a client sees only their own threads and payments, a specialist only their own bookings and earnings, admin sees everything through a server-side role check.
- Admin at `/ashnight-control` gated by a real role in the database, not by knowing the URL.
- Vetting becomes real: an application is a database row, admin approves it and assigns a room, and that decision actually controls what the person can access.

## Phase 2 — Real chat

- `threads` + `messages` tables, live delivery between two genuine logged-in users via realtime subscriptions.
- The simulated auto-reply is deleted.
- Read receipts, typing indicators, unread counts, attachments in file storage.
- Moderation runs server-side on send, so a blocked contact number is blocked for everyone, not just in one browser. Hits log to a real review queue.
- Reports and star ratings become database rows feeding the real admin triage queue.

## Phase 3 — Real money (Paystack)

- Real Paystack checkout for memberships, service requests and gifts.
- A webhook endpoint Paystack calls to confirm payment — this is what makes a payment real rather than a local reference string.
- Escrow becomes a server-side ledger: funds held on confirmed payment, hold window counted by a scheduled server job (not a browser timer, so it keeps running when nobody has the app open), auto-release when the window elapses with no dispute, freeze on dispute.
- Admin escrow controls act on real balances.

## Phase 4 — Real calls

LiveKit (open source, and self-hostable on your own server alongside everything else) for genuine audio/video between two participants, with your existing per-room admin gating deciding who's allowed to call.

## What I need from you

I can build Phases 1 and 2 completely on my own, right now.

- **Paystack secret key** — for Phase 3. From your Paystack dashboard, Settings → API Keys. Note: actually paying specialists out to their accounts needs Transfers enabled on your Paystack account, which is a separate approval from them. Until then escrow tracks balances precisely and admin triggers payouts manually.
- **LiveKit API key + secret** — for Phase 4. Free tier at livekit.io, or point it at your own LiveKit server later.

## Notes on self-hosting

I'll keep all schema changes as ordered SQL migration files and avoid anything platform-proprietary, so moving to your own server later is: run Supabase (or plain Postgres + GoTrue + Realtime + Storage) on your box, apply the same migrations, swap the URL and keys in the environment file, and deploy the app. I'll write you a short handover doc covering exactly that when the build is done.

## Order of work

I'll start with Phase 1 and 2 now, since they need nothing from you, and stop for your keys before Phase 3.
