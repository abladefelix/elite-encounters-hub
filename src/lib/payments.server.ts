/**
 * Server-only Paystack layer.
 *
 * No payment credential lives in the codebase or in an env file: every key is
 * read at call time from the admin-owned `integration_keys` vault (Control room
 * → Keys & security). Rotating a key there takes effect on the next request.
 */
import type { Database } from "@/integrations/supabase/types";

type Tier = Database["public"]["Enums"]["tier"];

const PAYSTACK_API = "https://api.paystack.co";

export async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Reads the requested credentials out of the admin vault. */
export async function vaultKeys(keys: string[]): Promise<Record<string, string>> {
  const admin = await adminClient();
  const { data, error } = await admin.from("integration_keys").select("key, value").in("key", keys);
  if (error) throw new Error(`Could not read the key vault: ${error.message}`);
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.key] = row.value ?? "";
  return map;
}

export async function paystackSecret(): Promise<string> {
  const keys = await vaultKeys(["paystack_secret_key"]);
  const secret = (keys["paystack_secret_key"] ?? "").trim();
  if (!secret) {
    throw new Error(
      "Paystack isn't configured yet. An admin must add the Paystack secret key in Control room → Keys & security.",
    );
  }
  return secret;
}

async function paystack<T>(path: string, init: RequestInit, secret: string): Promise<T> {
  const res = await fetch(`${PAYSTACK_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: { status?: boolean; message?: string; data?: T } = {};
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    throw new Error(`Paystack returned an unreadable response [${res.status}]`);
  }
  if (!res.ok || body.status === false) {
    throw new Error(body.message || `Paystack request failed [${res.status}]`);
  }
  return body.data as T;
}

export interface PaystackInitData {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface PaystackVerifyData {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  channel?: string;
  metadata?: Record<string, unknown>;
}

export function reference(prefix: string) {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ASH-${prefix}-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

export function toPesewas(amountGhs: number) {
  return Math.round(amountGhs * 100);
}

export async function initializeTransaction(input: {
  email: string;
  amountGhs: number;
  reference: string;
  callbackUrl: string;
  channel?: string | undefined;
  metadata: Record<string, unknown>;
}): Promise<PaystackInitData> {
  const secret = await paystackSecret();
  const channels = input.channel ? [input.channel] : undefined;
  return paystack<PaystackInitData>(
    "/transaction/initialize",
    {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        amount: toPesewas(input.amountGhs),
        currency: "GHS",
        reference: input.reference,
        callback_url: input.callbackUrl,
        ...(channels ? { channels } : {}),
        metadata: input.metadata,
      }),
    },
    secret,
  );
}

export async function verifyTransaction(ref: string): Promise<PaystackVerifyData> {
  const secret = await paystackSecret();
  return paystack<PaystackVerifyData>(
    `/transaction/verify/${encodeURIComponent(ref)}`,
    { method: "GET" },
    secret,
  );
}

/* ------------------------------------------------------------------ settings */

export interface ServerSettings {
  escrow: {
    escrowEnabled?: boolean;
    holdHours?: number;
    requireClientConfirm?: boolean;
    autoConfirmHours?: number;
    autoConfirmAction?: "clearing" | "release";
    autoReleaseEnabled?: boolean;
    tipsEnabled?: boolean;
    tipFeePct?: number;
    tipsEscrowed?: boolean;
    maxTip?: number;
  };
  platform: { platformFeePct?: number; membershipEnabled?: boolean };
  rooms: Record<string, { priceMonthly?: number; name?: string }>;
  /** Admin-priced booking extras, mirrored from src/lib/addons.ts. */
  addons: { enabled?: boolean; items?: { id: string; label: string; price?: number }[] };
}

export async function serverSettings(): Promise<ServerSettings> {
  const admin = await adminClient();
  const { data } = await admin.from("platform_settings").select("data").eq("id", true).maybeSingle();
  const blob = (data?.data ?? {}) as Record<string, unknown>;
  return {
    escrow: (blob["escrow"] ?? {}) as ServerSettings["escrow"],
    platform: (blob["platform"] ?? {}) as ServerSettings["platform"],
    rooms: (blob["rooms"] ?? {}) as ServerSettings["rooms"],
    addons: (blob["addons"] ?? {}) as ServerSettings["addons"],
  };
}

/**
 * Price of the chosen add-ons, resolved from admin settings rather than from
 * anything the browser sent, so a member can never price their own extras.
 */
export function addonsAmount(settings: ServerSettings, labels: string[]): number {
  if (settings.addons?.enabled === false) return 0;
  const items = settings.addons?.items ?? [];
  return labels.reduce((total, label) => {
    const match = items.find(
      (item) => item.label.trim().toLowerCase() === String(label).trim().toLowerCase(),
    );
    return total + (typeof match?.price === "number" ? Math.max(0, match.price) : 0);
  }, 0);
}

export function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

export function split(amountGhs: number, feePct: number) {
  const fee = Math.round(amountGhs * (feePct / 100));
  return { amount: amountGhs, fee, net: amountGhs - fee };
}

export function roomPrice(settings: ServerSettings, room: Tier): number {
  const fallback: Partial<Record<Tier, number>> = { basic: 150, premium: 350, ultimate: 900 };
  const configured = settings.rooms?.[room]?.priceMonthly;
  if (typeof configured === "number" && configured > 0) return configured;
  const fallbackPrice = fallback[room];
  if (fallbackPrice) return fallbackPrice;
  throw new Error(`The membership price for ${settings.rooms?.[room]?.name ?? room} has not been configured.`);
}

/* ---------------------------------------------------------------- finalising */

/**
 * Applies a confirmed Paystack charge. Safe to call repeatedly — the webhook
 * and the browser return trip both land here.
 */
export async function finalizeReference(
  ref: string,
  paidChannel?: string,
): Promise<{ applied: boolean; detail: string }> {
  const admin = await adminClient();
  const settings = await serverSettings();

  const { data: groupEntries, error: groupEntriesError } = await admin
    .from("escrow_entries")
    .select("*")
    .eq("paystack_reference", ref)
    .not("group_booking_id", "is", null)
    .order("created_at");
  if (groupEntriesError) throw new Error(groupEntriesError.message);
  if (groupEntries?.length) {
    if (groupEntries.every((row) => row.state !== "pending")) return { applied: false, detail: "Already applied" };
    const first = groupEntries[0];
    if (!first?.group_booking_id || !first.thread_id) throw new Error("The group payment record is incomplete.");
    const now = new Date().toISOString();
    const requireConfirm = settings.escrow.requireClientConfirm ?? true;
    const escrowed = settings.escrow.escrowEnabled ?? true;
    const state: Database["public"]["Enums"]["escrow_state"] = !escrowed ? "released" : requireConfirm ? "held" : "clearing";
    const patch: Database["public"]["Tables"]["escrow_entries"]["Update"] = {
      state,
      paid_at: now,
      ...(state === "released" ? { released_at: now } : {}),
      ...(state === "clearing" ? { release_at: hoursFromNow(first.hold_hours || (settings.escrow.holdHours ?? 24)) } : {}),
      admin_note: paidChannel ? `Group payment confirmed via Paystack (${paidChannel}).` : "Group payment confirmed via Paystack.",
    };
    const { error: escrowError } = await admin
      .from("escrow_entries")
      .update(patch)
      .eq("paystack_reference", ref)
      .eq("state", "pending");
    if (escrowError) throw new Error(escrowError.message);
    const { data: groupBooking, error: bookingError } = await admin
      .from("group_bookings")
      .update({ status: "paid", paid_at: now })
      .eq("id", first.group_booking_id)
      .select("service_name, hours, scheduled_for, subtotal, platform_fee, total")
      .single();
    if (bookingError) throw new Error(bookingError.message);
    await admin.from("messages").insert({
      thread_id: first.thread_id,
      author_id: null,
      kind: "system",
      body: `Group payment confirmed — GHS ${groupBooking.total.toLocaleString()} is secured across ${groupEntries.length} specialist escrow accounts.`,
    });
    const when = groupBooking.scheduled_for
      ? new Date(groupBooking.scheduled_for).toLocaleString("en-GH", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : "the next available slot";
    await admin.from("notifications").insert(groupEntries.map((row) => ({
      user_id: row.specialist_id,
      kind: "booking",
      title: "Group payment approved — job confirmed",
      body: `${groupBooking.service_name} · ${groupBooking.hours}h for ${when}. Your GHS ${row.payout_amount.toLocaleString()} allocation is secured in escrow.`,
      link: "/messages",
    })));
    await admin.from("notifications").insert({
      user_id: first.client_id,
      kind: "payment",
      title: "Group booking payment received",
      body: `GHS ${groupBooking.total.toLocaleString()} is secured in escrow for the full Ash group.`,
      link: "/wallet",
    });
    await issueDocument({
      kind: "receipt",
      clientId: first.client_id,
      specialistId: null,
      groupBookingId: first.group_booking_id,
      title: `Group booking — ${groupBooking.service_name}`,
      subtotal: groupBooking.subtotal,
      platformFee: groupBooking.platform_fee,
      total: groupBooking.total,
      lines: [
        { label: `${groupBooking.service_name} (${groupBooking.hours}h)`, quantity: Number(groupBooking.hours), unitAmount: Math.round(groupBooking.subtotal / Number(groupBooking.hours)), amount: groupBooking.subtotal },
        { label: "Ashnight service fee", quantity: 1, unitAmount: groupBooking.platform_fee, amount: groupBooking.platform_fee },
      ],
      paystackReference: ref,
      paid: true,
      notes: "Paid in full. Each specialist allocation is held and released independently under the group escrow terms.",
    });
    return { applied: true, detail: `Group booking ${first.group_booking_id} paid across ${groupEntries.length} escrow legs` };
  }

  const { data: entry } = await admin
    .from("escrow_entries")
    .select("*")
    .eq("paystack_reference", ref)
    .maybeSingle();

  if (entry) {
    if (entry.state !== "pending") return { applied: false, detail: "Already applied" };
    const escrowed =
      (settings.escrow.escrowEnabled ?? true) &&
      (entry.kind === "booking" || (settings.escrow.tipsEscrowed ?? false));
    const holdHours = entry.hold_hours || (settings.escrow.holdHours ?? 24);
    const now = new Date().toISOString();

    const patch: Database["public"]["Tables"]["escrow_entries"]["Update"] = {
      paid_at: now,
      admin_note: paidChannel ? `Paid via Paystack (${paidChannel}).` : "Paid via Paystack.",
    };
    if (!escrowed) {
      patch.state = "released";
      patch.released_at = now;
      patch.admin_note = "Paid straight through — escrow not applied to this payment type.";
    } else if (settings.escrow.requireClientConfirm ?? true) {
      patch.state = "held";
    } else {
      patch.state = "clearing";
      patch.release_at = hoursFromNow(holdHours);
    }

    const { error } = await admin.from("escrow_entries").update(patch).eq("id", entry.id);
    if (error) throw new Error(error.message);

    if (entry.booking_id) {
      await admin.from("bookings").update({ status: "paid" }).eq("id", entry.booking_id);
    }
    if (entry.thread_id) {
      await admin.from("messages").insert({
        thread_id: entry.thread_id,
        author_id: null,
        kind: "system",
        escrow_id: entry.id,
        body: `Payment confirmed — GHS ${entry.amount.toLocaleString()} is ${
          patch.state === "released" ? "on its way to the specialist" : "secured in Ashnight escrow"
        }.`,
      });
    }

    // The specialist is told the moment the money clears, so they can go and do
    // the work. Only bookings trigger this; gifts need no action.
    if (entry.kind === "booking") {
      const { data: booking } = entry.booking_id
        ? await admin
            .from("bookings")
            .select("service_name, hours, scheduled_for")
            .eq("id", entry.booking_id)
            .maybeSingle()
        : { data: null };
      const when = booking?.scheduled_for
        ? new Date(booking.scheduled_for).toLocaleString("en-GH", {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "the next available slot";
      await admin.from("notifications").insert({
        user_id: entry.specialist_id,
        kind: "booking",
        title: "Payment approved — job confirmed",
        body: `${booking?.service_name ?? (entry.label || "An ash service")}${
          booking?.hours ? ` · ${booking.hours}h` : ""
        } for ${when}. GHS ${entry.payout_amount.toLocaleString()} is waiting in escrow — go ahead and complete the visit.`,
        link: "/messages",
      });
      if (entry.thread_id) {
        await admin.from("messages").insert({
          thread_id: entry.thread_id,
          author_id: null,
          kind: "system",
          escrow_id: entry.id,
          body: "Payment confirmed and held in escrow — the specialist can now start the job.",
        });
      }
    }

    // The paying member gets the same courtesy: a receipt notification plus a
    // clear statement of what happens to the money next.
    if (entry.kind === "booking") {
      await admin.from("notifications").insert({
        user_id: entry.client_id,
        kind: "payment",
        title: "Payment received — job confirmed",
        body: `GHS ${entry.amount.toLocaleString()} for ${entry.label || "your ash service"} is ${
          patch.state === "released"
            ? "on its way to your specialist"
            : "held in Ashnight escrow. Confirm the visit once it's done and the payout starts clearing."
        }`,
        link: "/wallet",
      });
    }


    // A confirmed charge always leaves a receipt the member can download.
    await issueDocument({
      kind: "receipt",
      clientId: entry.client_id,
      specialistId: entry.specialist_id,
      bookingId: entry.booking_id,
      escrowId: entry.id,
      title: entry.label || (entry.kind === "gift" ? "Ashnight gift" : "Ash service"),
      subtotal: entry.amount,
      platformFee: entry.platform_fee,
      total: entry.amount,
      lines: [
        {
          label: entry.label || "Ash service",
          quantity: 1,
          unitAmount: entry.amount,
          amount: entry.amount,
        },
      ],
      paystackReference: ref,
      paid: true,
      notes:
        patch.state === "released"
          ? "Paid in full and settled to the specialist."
          : "Paid in full and held in Ashnight escrow until the visit is confirmed.",
    });

    return { applied: true, detail: `Escrow ${entry.id} → ${patch.state}` };

  }

  const { data: membership } = await admin
    .from("memberships")
    .select("*")
    .eq("paystack_reference", ref)
    .maybeSingle();

  if (membership) {
    if (membership.status === "active") return { applied: false, detail: "Already active" };
    const { error } = await admin
      .from("memberships")
      .update({
        status: "active",
        current_period_end: hoursFromNow(24 * 30),
      })
      .eq("id", membership.id);
    if (error) throw new Error(error.message);

    // Paying reinstates the member immediately: back into their room and back
    // to an active account if the lapse had switched them off.
    const { data: profile } = await admin
      .from("profiles")
      .select("account_status")
      .eq("id", membership.user_id)
      .maybeSingle();
    await admin
      .from("profiles")
      .update({
        room: membership.room,
        account_status: profile?.account_status === "banned" ? "banned" : "active",
        status_reason:
          profile?.account_status === "banned" ? "Banned by Ashnight." : "Membership paid and active.",
        status_changed_at: new Date().toISOString(),
      })
      .eq("id", membership.user_id);
    await admin.from("notifications").insert({
      user_id: membership.user_id,
      kind: "membership",
      title: "Membership active",
      body: `Your ${membership.room} room is open again for the next 30 days.`,
      link: "/rooms",
    });



    await issueDocument({
      kind: "receipt",
      clientId: membership.user_id,
      title: `Ashnight ${membership.room} room membership`,
      subtotal: membership.amount,
      platformFee: 0,
      total: membership.amount,
      lines: [
        {
          label: `${membership.room} room — 30 days`,
          quantity: 1,
          unitAmount: membership.amount,
          amount: membership.amount,
        },
      ],
      paystackReference: ref,
      paid: true,
      notes: "Membership renews manually — you'll be prompted before it lapses.",
    });
    return { applied: true, detail: `Membership ${membership.id} activated` };

  }

  return { applied: false, detail: "No matching payment on file" };
}

/**
 * Lapsed-membership sweep. Only clients hold memberships, so when a period end
 * passes without payment the membership goes past due and the account is
 * deactivated — sign-in stays closed until they pay again, which
 * `finalizeReference` reverses automatically.
 */
export async function syncMemberships(): Promise<{ lapsed: number }> {
  const admin = await adminClient();
  const nowIso = new Date().toISOString();

  const { data: expired } = await admin
    .from("memberships")
    .select("id, user_id, room, current_period_end")
    .eq("status", "active")
    .not("current_period_end", "is", null)
    .lte("current_period_end", nowIso);

  let lapsed = 0;
  for (const row of expired ?? []) {
    await admin.from("memberships").update({ status: "past_due" }).eq("id", row.id);

    const { data: profile } = await admin
      .from("profiles")
      .select("account_status")
      .eq("id", row.user_id)
      .maybeSingle();
    // Never soften a suspension or a ban — only active/pending accounts lapse.
    if (profile && (profile.account_status === "active" || profile.account_status === "pending")) {
      await admin
        .from("profiles")
        .update({
          account_status: "deactivated",
          status_reason: "Membership expired — reactivates as soon as it is paid.",
          status_changed_at: nowIso,
        })
        .eq("id", row.user_id);
    }
    await admin.from("notifications").insert({
      user_id: row.user_id,
      kind: "membership",
      title: "Membership expired",
      body: `Your ${row.room} room membership has lapsed and your account is paused. Pay again to reactivate instantly.`,
      link: "/rooms",
    });
    lapsed += 1;
  }

  return { lapsed };
}

/**
 * The scheduled settlement pass: starts clearing for stale un-confirmed holds
 * and deposits anything whose hold window has elapsed without a dispute.
 */
export async function settleDueEscrow(): Promise<{
  autoConfirmed: number;
  released: number;
  membershipsLapsed: number;
  skipped: string | null;
}> {
  const admin = await adminClient();
  const settings = await serverSettings();
  // Membership state is kept honest on every pass, even when auto-deposits are off.
  const { lapsed: membershipsLapsed } = await syncMemberships();
  if (!(settings.escrow.autoReleaseEnabled ?? true)) {
    return {
      autoConfirmed: 0,
      released: 0,
      membershipsLapsed,
      skipped: "Automatic deposits are switched off",
    };
  }
  const holdHours = settings.escrow.holdHours ?? 24;
  const autoConfirmHours = settings.escrow.autoConfirmHours ?? 24;
  const autoConfirmAction = settings.escrow.autoConfirmAction ?? "release";
  const now = Date.now();

  const { data: held } = await admin
    .from("escrow_entries")
    .select("id, paid_at")
    .eq("state", "held");
  let autoConfirmed = 0;
  for (const row of held ?? []) {
    const paid = row.paid_at ? new Date(row.paid_at).getTime() : now;
    if (now - paid < autoConfirmHours * 3600_000) continue;
    const patch =
      autoConfirmAction === "release"
        ? {
            state: "released" as const,
            release_at: null,
            released_at: new Date().toISOString(),
            admin_note: `No confirmation from the member after ${autoConfirmHours}h — visit marked complete and payout deposited automatically.`,
          }
        : {
            state: "clearing" as const,
            release_at: hoursFromNow(holdHours),
            admin_note: `No confirmation from the member after ${autoConfirmHours}h — visit marked complete and clearing started automatically.`,
          };
    await admin.from("escrow_entries").update(patch).eq("id", row.id);
    autoConfirmed += 1;
  }


  const { data: due } = await admin
    .from("escrow_entries")
    .select("id")
    .eq("state", "clearing")
    .not("release_at", "is", null)
    .lte("release_at", new Date(now).toISOString());
  let released = 0;
  for (const row of due ?? []) {
    await admin
      .from("escrow_entries")
      .update({
        state: "released",
        release_at: null,
        released_at: new Date().toISOString(),
        admin_note: "Auto-deposited — hold window elapsed with no issues raised.",
      })
      .eq("id", row.id);
    released += 1;
  }

  return { autoConfirmed, released, membershipsLapsed, skipped: null };
}

/* ------------------------------------------------------------ paper trail */

type DocumentKind = Database["public"]["Enums"]["document_kind"];

export interface DocumentLineInput {
  label: string;
  quantity: number;
  unitAmount: number;
  amount: number;
}

/** Sequential, human-readable document number: ASH-INV-2026-000123. */
async function documentNumber(kind: DocumentKind) {
  const admin = await adminClient();
  const year = new Date().getFullYear();
  const { count } = await admin
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("kind", kind);
  const seq = String((count ?? 0) + 1).padStart(6, "0");
  return `ASH-${kind === "invoice" ? "INV" : "RCT"}-${year}-${seq}`;
}

/**
 * Issues an invoice or receipt. Amounts are always the server-computed ones, so
 * the document can be trusted as the record of what was actually charged.
 */
export async function issueDocument(input: {
  kind: DocumentKind;
  clientId: string;
  specialistId?: string | null;
  bookingId?: string | null;
  escrowId?: string | null;
  groupBookingId?: string | null;
  title: string;
  subtotal: number;
  platformFee: number;
  total: number;
  lines: DocumentLineInput[];
  paystackReference?: string | null;
  notes?: string;
  paid?: boolean;
}) {
  const admin = await adminClient();

  if (input.paystackReference) {
    const { data: existing } = await admin
      .from("documents")
      .select("id")
      .eq("kind", input.kind)
      .eq("paystack_reference", input.paystackReference)
      .maybeSingle();
    if (existing) return existing.id;
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("documents")
    .insert({
      number: await documentNumber(input.kind),
      kind: input.kind,
      client_id: input.clientId,
      specialist_id: input.specialistId ?? null,
      booking_id: input.bookingId ?? null,
      escrow_id: input.escrowId ?? null,
      group_booking_id: input.groupBookingId ?? null,
      title: input.title,
      currency: "GHS",
      subtotal: input.subtotal,
      platform_fee: input.platformFee,
      total: input.total,
      line_items: input.lines as never,
      paystack_reference: input.paystackReference ?? null,
      notes: input.notes ?? "",
      issued_at: now,
      paid_at: input.paid ? now : null,
    })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}
