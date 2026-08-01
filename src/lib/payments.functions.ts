/**
 * Payment + escrow server actions.
 *
 * Everything that moves money runs here, on the server, with the amount
 * recomputed from database rows and admin settings — never trusted from the
 * browser. Paystack credentials come from the admin key vault at call time.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const tier = z.enum(["basic", "premium", "ultimate"]);

const checkoutBase = z.object({
  callbackUrl: z.string().url().max(500),
  channel: z.enum(["mobile_money", "card", "bank_transfer", "ussd"]).optional(),
});

/** Client pays for a booking they already created in the thread. */
export const startBookingCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => checkoutBase.extend({ bookingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const {
      adminClient,
      initializeTransaction,
      reference,
      serverSettings,
      split,
    } = await import("./payments.server");
    const admin = await adminClient();

    const { data: booking, error } = await admin
      .from("bookings")
      .select("*")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking) throw new Error("That booking no longer exists.");
    if (booking.client_id !== context.userId) throw new Error("This booking isn't yours to pay.");
    if (booking.status === "paid" || booking.status === "completed") {
      throw new Error("This booking is already paid.");
    }

    const settings = await serverSettings();
    const feePct = booking.platform_fee_pct ?? settings.platform.platformFeePct ?? 12;
    const subtotal = Number(booking.hours) * booking.rate;
    const fee = Math.round(subtotal * (feePct / 100));
    const total = subtotal + fee;
    if (!(total > 0)) throw new Error("That booking has no payable amount.");

    const ref = reference("BK");
    const money = split(total, feePct);

    const { data: entry, error: insertError } = await admin
      .from("escrow_entries")
      .insert({
        kind: "booking",
        thread_id: booking.thread_id,
        booking_id: booking.id,
        client_id: booking.client_id,
        specialist_id: booking.specialist_id,
        label: `${booking.service_name} · ${booking.hours}h`,
        amount: money.amount,
        platform_fee: money.fee,
        payout_amount: money.net,
        hold_hours: settings.escrow.holdHours ?? 24,
        state: "pending",
        paystack_reference: ref,
      })
      .select()
      .single();
    if (insertError) throw new Error(insertError.message);

    const init = await initializeTransaction({
      email: String(context.claims["email"] ?? "") || `${context.userId}@members.ashnight`,
      amountGhs: total,
      reference: ref,
      callbackUrl: data.callbackUrl,
      channel: data.channel,
      metadata: { purpose: "booking", booking_id: booking.id, escrow_id: entry.id },
    });

    // The member gets an invoice the moment checkout opens; the receipt follows
    // once Paystack confirms the charge.
    const { issueDocument } = await import("./payments.server");
    await issueDocument({
      kind: "invoice",
      clientId: booking.client_id,
      specialistId: booking.specialist_id,
      bookingId: booking.id,
      escrowId: entry.id,
      title: `${booking.service_name} — ${booking.hours}h`,
      subtotal,
      platformFee: fee,
      total,
      lines: [
        {
          label: `${booking.service_name} (${booking.hours}h @ GHS ${booking.rate}/h)`,
          quantity: Number(booking.hours),
          unitAmount: booking.rate,
          amount: subtotal,
        },
        { label: `Ashnight service fee (${feePct}%)`, quantity: 1, unitAmount: fee, amount: fee },
      ],
      paystackReference: ref,
      notes: "Payable through Paystack. Funds are held in escrow until the visit is confirmed.",
    });

    return { authorizationUrl: init.authorization_url, reference: ref, amount: total };
  });

/** Client sends a cash gift in chat. */
export const startGiftCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    checkoutBase
      .extend({
        threadId: z.string().uuid(),
        giftKey: z.string().min(1).max(60),
        giftLabel: z.string().min(1).max(120),
        amount: z.number().int().positive().max(100_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const {
      adminClient,
      initializeTransaction,
      reference,
      serverSettings,
      split,
    } = await import("./payments.server");
    const admin = await adminClient();
    const settings = await serverSettings();
    if (!(settings.escrow.tipsEnabled ?? true)) throw new Error("Cash gifts are switched off.");

    const { data: thread } = await admin
      .from("threads")
      .select("id, client_id, specialist_id")
      .eq("id", data.threadId)
      .maybeSingle();
    if (!thread) throw new Error("That conversation no longer exists.");
    if (thread.client_id !== context.userId) throw new Error("Only the client can send a gift.");

    const cap = settings.escrow.maxTip ?? 1000;
    const amount = Math.min(data.amount, cap);
    const feePct = settings.escrow.tipFeePct ?? 8;
    const money = split(amount, feePct);
    const ref = reference("GF");

    const { data: entry, error } = await admin
      .from("escrow_entries")
      .insert({
        kind: "gift",
        thread_id: thread.id,
        client_id: thread.client_id,
        specialist_id: thread.specialist_id,
        label: data.giftLabel,
        gift_key: data.giftKey,
        amount: money.amount,
        platform_fee: money.fee,
        payout_amount: money.net,
        hold_hours: settings.escrow.holdHours ?? 24,
        state: "pending",
        paystack_reference: ref,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const init = await initializeTransaction({
      email: String(context.claims["email"] ?? "") || `${context.userId}@members.ashnight`,
      amountGhs: amount,
      reference: ref,
      callbackUrl: data.callbackUrl,
      channel: data.channel,
      metadata: { purpose: "gift", escrow_id: entry.id, gift: data.giftKey },
    });

    return {
      authorizationUrl: init.authorization_url,
      reference: ref,
      amount,
      net: money.net,
    };
  });

/** Client pays a monthly membership for a room. */
export const startMembershipCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => checkoutBase.extend({ room: tier }).parse(input))
  .handler(async ({ data, context }) => {
    const { adminClient, initializeTransaction, reference, roomPrice, serverSettings } =
      await import("./payments.server");
    const admin = await adminClient();
    const settings = await serverSettings();
    const price = roomPrice(settings, data.room);
    const ref = reference("MB");

    const { error } = await admin.from("memberships").insert({
      user_id: context.userId,
      room: data.room,
      status: "past_due",
      amount: price,
      paystack_reference: ref,
    });
    if (error) throw new Error(error.message);

    const init = await initializeTransaction({
      email: String(context.claims["email"] ?? "") || `${context.userId}@members.ashnight`,
      amountGhs: price,
      reference: ref,
      callbackUrl: data.callbackUrl,
      channel: data.channel,
      metadata: { purpose: "membership", room: data.room, user_id: context.userId },
    });

    return { authorizationUrl: init.authorization_url, reference: ref, amount: price };
  });

/** Confirms a charge from the browser after Paystack redirects back. */
export const confirmPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ reference: z.string().min(6).max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const { adminClient, finalizeReference, verifyTransaction } = await import("./payments.server");
    const admin = await adminClient();

    // The caller may only ask about a payment that belongs to them.
    const [{ data: entry }, { data: membership }] = await Promise.all([
      admin
        .from("escrow_entries")
        .select("client_id, amount, kind")
        .eq("paystack_reference", data.reference)
        .maybeSingle(),
      admin
        .from("memberships")
        .select("user_id, amount, room")
        .eq("paystack_reference", data.reference)
        .maybeSingle(),
    ]);
    const owner = entry?.client_id ?? membership?.user_id ?? null;
    if (!owner) throw new Error("We couldn't find that payment.");
    if (owner !== context.userId) throw new Error("That payment isn't yours.");

    const verified = await verifyTransaction(data.reference);
    if (verified.status !== "success") {
      return { status: verified.status, applied: false, amount: verified.amount / 100 };
    }
    const result = await finalizeReference(data.reference, verified.channel);
    return {
      status: "success" as const,
      applied: result.applied,
      amount: verified.amount / 100,
      kind: entry?.kind ?? "membership",
    };
  });

/** Member confirms the visit is done — starts the clearing countdown. */
export const confirmEscrowComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ escrowId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { adminClient, hoursFromNow, serverSettings } = await import("./payments.server");
    const admin = await adminClient();
    const { data: entry } = await admin
      .from("escrow_entries")
      .select("id, client_id, state, booking_id")
      .eq("id", data.escrowId)
      .maybeSingle();
    if (!entry) throw new Error("That payment no longer exists.");
    if (entry.client_id !== context.userId) throw new Error("Only the member who paid can confirm.");
    if (entry.state !== "held") throw new Error("This payment isn't waiting for confirmation.");

    const settings = await serverSettings();
    const { error } = await admin
      .from("escrow_entries")
      .update({
        state: "clearing",
        release_at: hoursFromNow(settings.escrow.holdHours ?? 24),
        admin_note: "Member confirmed the visit — clearing window started.",
      })
      .eq("id", entry.id);
    if (error) throw new Error(error.message);
    if (entry.booking_id) {
      await admin.from("bookings").update({ status: "completed" }).eq("id", entry.booking_id);
    }
    return { ok: true };
  });

/** Member freezes a payout while a problem is looked at. */
export const raiseEscrowIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ escrowId: z.string().uuid(), reason: z.string().trim().min(4).max(600) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { adminClient } = await import("./payments.server");
    const admin = await adminClient();
    const { data: entry } = await admin
      .from("escrow_entries")
      .select("id, client_id, state, booking_id")
      .eq("id", data.escrowId)
      .maybeSingle();
    if (!entry) throw new Error("That payment no longer exists.");
    if (entry.client_id !== context.userId) throw new Error("Only the member who paid can raise an issue.");
    if (entry.state === "refunded") throw new Error("That payment was already refunded.");

    const { error } = await admin
      .from("escrow_entries")
      .update({
        state: "disputed",
        release_at: null,
        dispute_reason: data.reason,
        disputed_at: new Date().toISOString(),
      })
      .eq("id", entry.id);
    if (error) throw new Error(error.message);
    if (entry.booking_id) {
      await admin.from("bookings").update({ status: "disputed" }).eq("id", entry.booking_id);
    }
    return { ok: true };
  });
