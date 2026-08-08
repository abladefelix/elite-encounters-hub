/**
 * Payment + escrow server actions.
 *
 * Everything that moves money runs here, on the server, with the amount
 * recomputed from database rows and admin settings — never trusted from the
 * browser. Paystack credentials come from the admin key vault at call time.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireActiveSession as requireSupabaseAuth } from "@/lib/active-session-middleware";

const tier = z.enum(["basic", "premium", "ultimate"]);

const checkoutBase = z.object({
  callbackUrl: z.string().url().max(500),
  channel: z.enum(["mobile_money", "card", "bank_transfer", "ussd"]).optional(),
});

/** Client pays for a booking they already created in the thread. */
export const startBookingCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => checkoutBase.extend({ bookingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const {
      addonsAmount,
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
    if (booking.status === "cancelled") throw new Error("This payment request was cancelled.");
    if (!booking.acknowledged_at) {
      throw new Error(
        booking.ack_requested_at
          ? "Your specialist hasn't acknowledged this request yet — you can pay as soon as they do."
          : "Send this request to your specialist for acknowledgement before paying.",
      );
    }

    const settings = await serverSettings();
    const feePct = booking.platform_fee_pct ?? settings.platform.platformFeePct ?? 12;
    const labour = Number(booking.hours) * booking.rate;
    // Add-on prices come from the admin catalogue, matched on the stored labels.
    const extras = addonsAmount(settings, booking.addons ?? []);
    const subtotal = labour + extras;
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
          amount: labour,
        },
        ...(extras > 0
          ? [
              {
                label: `Add-ons: ${(booking.addons ?? []).join(", ")}`,
                quantity: 1,
                unitAmount: extras,
                amount: extras,
              },
            ]
          : []),
        { label: `Ashnight service fee (${feePct}%)`, quantity: 1, unitAmount: fee, amount: fee },
      ],
      paystackReference: ref,
      notes: "Payable through Paystack. Funds are held in escrow until the visit is confirmed.",
    });

    return { authorizationUrl: init.authorization_url, reference: ref, amount: total };
  });

/** Client pays only after every specialist in the proposed group has confirmed. */
export const startGroupBookingCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => checkoutBase.extend({
    groupBookingId: z.string().uuid(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { adminClient, initializeTransaction, reference, serverSettings } = await import("./payments.server");
    const admin = await adminClient();
    const ref = reference("GRP");
    const { data: snapshot, error } = await admin.rpc("prepare_group_booking_payment", {
      _group_booking_id: data.groupBookingId,
      _requesting_user: context.userId,
      _paystack_reference: ref,
    });
    if (error) throw new Error(error.message);
    const booking = snapshot as unknown as { group_booking_id: string; thread_id: string; total: number; service_name: string; lead_id: string };
    try {
      const init = await initializeTransaction({
        email: String(context.claims["email"] ?? "") || `${context.userId}@members.ashnight`,
        amountGhs: booking.total,
        reference: ref,
        callbackUrl: data.callbackUrl,
        channel: data.channel,
        metadata: { purpose: "group_booking", group_booking_id: booking.group_booking_id, thread_id: booking.thread_id },
      });
      return { authorizationUrl: init.authorization_url, reference: ref, amount: booking.total, groupBookingId: booking.group_booking_id, threadId: booking.thread_id };
    } catch (paymentError) {
      await admin.from("escrow_entries").delete().eq("group_booking_id", booking.group_booking_id).eq("state", "pending").is("paid_at", null);
      await admin.from("group_bookings").update({ paystack_reference: null }).eq("id", booking.group_booking_id).eq("client_id", context.userId).eq("status", "accepted");
      throw paymentError;
    }
  });

/** Client sends a cash gift in chat. */
export const startGiftCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
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
  .validator((input) => checkoutBase.extend({ room: tier }).parse(input))
  .handler(async ({ data, context }) => {
    const { adminClient, initializeTransaction, reference, roomPrice, serverSettings } =
      await import("./payments.server");
    const admin = await adminClient();

    // Only clients buy memberships. Specialists join free and are placed (and
    // promoted) by admin on rating, so they can never pay their way up a room.
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roleList = (roles ?? []).map((row) => row.role);
    if (roleList.includes("specialist") && !roleList.includes("admin")) {
      throw new Error(
        "Specialists don't pay for rooms — your room is set and upgraded by our team based on your ratings.",
      );
    }

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
  .validator((input) => z.object({ reference: z.string().min(6).max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const { adminClient, finalizeReference, verifyTransaction } = await import("./payments.server");
    const admin = await adminClient();

    // The caller may only ask about a payment that belongs to them.
    const [{ data: entry }, { data: membership }] = await Promise.all([
      admin
        .from("escrow_entries")
        .select("client_id, amount, kind")
        .eq("paystack_reference", data.reference)
        .limit(1)
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
    if (verified.currency !== "GHS") throw new Error("The confirmed payment currency is invalid.");
    const { data: allEntries } = await admin
      .from("escrow_entries")
      .select("amount")
      .eq("paystack_reference", data.reference);
    const expected = allEntries?.length
      ? allEntries.reduce((sum, row) => sum + row.amount, 0)
      : membership?.amount ?? 0;
    if (verified.amount !== expected * 100) {
      throw new Error("The confirmed payment amount does not match this checkout.");
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
  .validator((input) => z.object({ escrowId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { adminClient, hoursFromNow, serverSettings } = await import("./payments.server");
    const admin = await adminClient();
    const { data: entry } = await admin
      .from("escrow_entries")
      .select("id, client_id, state, booking_id, group_booking_id")
      .eq("id", data.escrowId)
      .maybeSingle();
    if (!entry) throw new Error("That payment no longer exists.");
    if (entry.client_id !== context.userId) throw new Error("Only the member who paid can confirm.");
    if (entry.state !== "held") throw new Error("This payment isn't waiting for confirmation.");

    const settings = await serverSettings();
    const target = entry.group_booking_id
      ? admin.from("escrow_entries").update({ state: "clearing", release_at: hoursFromNow(settings.escrow.holdHours ?? 24), admin_note: "Member confirmed the group visit — clearing window started." }).eq("group_booking_id", entry.group_booking_id).eq("state", "held")
      : admin
      .from("escrow_entries")
      .update({
        state: "clearing",
        release_at: hoursFromNow(settings.escrow.holdHours ?? 24),
        admin_note: "Member confirmed the visit — clearing window started.",
      })
      .eq("id", entry.id);
    const { error } = await target;
    if (error) throw new Error(error.message);
    if (entry.booking_id) {
      await admin.from("bookings").update({ status: "completed" }).eq("id", entry.booking_id);
    }
    if (entry.group_booking_id) {
      await admin.from("group_bookings").update({ status: "completed" }).eq("id", entry.group_booking_id);
    }
    return { ok: true };
  });

/** Member freezes a payout while a problem is looked at. */
export const raiseEscrowIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
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

/**
 * Specialist proposes work in a thread ("payment request").
 *
 * Specialists cannot insert bookings directly (RLS restricts inserts to the
 * paying client), so the quote is created here after we confirm the caller is
 * the specialist on that thread. Nothing is charged — the client still has to
 * tap "Pay now", which runs startBookingCheckout.
 */
export const createSpecialistQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        threadId: z.string().uuid(),
        serviceId: z.string().uuid().nullable().optional(),
        serviceName: z.string().trim().min(2).max(120),
        hours: z.number().min(0.5).max(24),
        rate: z.number().int().min(1).max(100000),
        addons: z.array(z.string().trim().max(120)).max(12).optional(),
        scheduledForIso: z.string().datetime().nullable().optional(),
        notes: z.string().trim().max(600).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { adminClient, addonsAmount, serverSettings } = await import("./payments.server");
    const admin = await adminClient();

    const { data: thread, error: threadError } = await admin
      .from("threads")
      .select("id, client_id, specialist_id")
      .eq("id", data.threadId)
      .maybeSingle();
    if (threadError) throw new Error(threadError.message);
    if (!thread) throw new Error("That conversation no longer exists.");
    if (thread.specialist_id !== context.userId) {
      throw new Error("Only the specialist on this thread can send a payment request.");
    }

    const settings = await serverSettings();
    const feePct = settings.platform.platformFeePct ?? 12;
    const addons = data.addons ?? [];
    const subtotal = data.hours * data.rate + addonsAmount(settings, addons);
    const fee = Math.round(subtotal * (feePct / 100));

    const { data: booking, error } = await admin
      .from("bookings")
      .insert({
        thread_id: thread.id,
        client_id: thread.client_id,
        specialist_id: context.userId,
        service_id: data.serviceId ?? null,
        service_name: data.serviceName,
        hours: data.hours,
        rate: data.rate,
        addons,
        platform_fee_pct: feePct,
        scheduled_for: data.scheduledForIso ?? null,
        notes: data.notes ?? "",
        status: "requested",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const total = subtotal + fee;
    const quoteBody = `Payment request · ${data.serviceName} · ${data.hours}h at GHS ${data.rate}/h${addons.length ? ` · Add-ons: ${addons.join(", ")}` : ""} · GHS ${total} to pay${data.notes ? ` — ${data.notes}` : ""}`;
    const { error: messageError } = await admin.from("messages").insert({
      thread_id: thread.id,
      author_id: context.userId,
      kind: "booking",
      booking_id: booking.id,
      body: quoteBody,
    });
    if (messageError) {
      await admin.from("bookings").delete().eq("id", booking.id);
      throw new Error(`Payment request could not be delivered: ${messageError.message}`);
    }

    const { error: notificationError } = await admin.from("notifications").insert({
      user_id: thread.client_id,
      title: "Payment request received",
      body: `${data.serviceName} · GHS ${total}. Open the conversation to review and pay securely into escrow.`,
      kind: "booking",
      link: `/messages?thread=${thread.id}`,
    });
    if (notificationError) {
      throw new Error(`Payment request was sent, but the notification failed: ${notificationError.message}`);
    }

    return { bookingId: booking.id, subtotal, fee, total, feePct };
  });

/**
 * Specialist asks Ashnight to release a payout that is sitting in escrow.
 *
 * This does not move money — it flags the entry for the control room, so a
 * paid job always leaves a record the specialist can act on rather than
 * waiting silently for the hold window.
 */
export const requestEscrowPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        escrowId: z.string().uuid(),
        note: z.string().trim().max(600).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { adminClient } = await import("./payments.server");
    const admin = await adminClient();

    const { data: entry } = await admin
      .from("escrow_entries")
      .select("id, specialist_id, state, payout_request_state, payout_amount, label")
      .eq("id", data.escrowId)
      .maybeSingle();
    if (!entry) throw new Error("That payment no longer exists.");
    if (entry.specialist_id !== context.userId) {
      throw new Error("Only the specialist paid for this job can request a release.");
    }
    if (entry.state === "pending") throw new Error("This payment hasn't been confirmed yet.");
    if (entry.state === "released") throw new Error("This payout has already been deposited.");
    if (entry.state === "refunded") throw new Error("This payment was refunded to the member.");
    // Funds only become requestable once the client has approved the visit
    // (or the auto-confirm window closed) — that is what moves it to clearing.
    if (entry.state === "held") {
      throw new Error("The member hasn't confirmed the visit yet — you can request the release once they do.");
    }
    if (entry.state === "disputed") {
      throw new Error("An issue was raised on this job. Ashnight will resolve it before any payout.");
    }
    if (entry.payout_request_state === "requested") {
      throw new Error("You've already requested this payout — Ashnight is reviewing it.");
    }

    const { error } = await admin
      .from("escrow_entries")
      .update({
        payout_request_state: "requested",
        payout_requested_at: new Date().toISOString(),
        payout_request_note: data.note ?? "",
      })
      .eq("id", entry.id);
    if (error) throw new Error(error.message);

    const { data: admins } = await admin.from("user_roles").select("user_id").eq("role", "admin");
    const rows = (admins ?? []).map((row) => ({
      user_id: row.user_id,
      kind: "escrow",
      title: "Payout release requested",
      body: `A specialist requested release of GHS ${entry.payout_amount.toLocaleString()} for “${entry.label}”.`,
      link: "/ashnight-control/escrow",
    }));
    if (rows.length) await admin.from("notifications").insert(rows);

    return { ok: true };
  });

/**
 * Client sends an existing payment request to the specialist for acknowledgement.
 *
 * Nothing is charged here. The specialist sees the exact services, add-ons,
 * hours and total, and must acknowledge before the client can pay.
 */
export const requestBookingAcknowledgement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ bookingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { adminClient, addonsAmount, serverSettings } = await import("./payments.server");
    const admin = await adminClient();

    const { data: booking, error } = await admin
      .from("bookings")
      .select("*")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking) throw new Error("That payment request no longer exists.");
    if (booking.client_id !== context.userId) {
      throw new Error("Only the member who requested this service can send it for acknowledgement.");
    }
    if (booking.status === "cancelled") throw new Error("This payment request was cancelled.");
    if (booking.status === "paid" || booking.status === "completed") {
      throw new Error("This request is already paid.");
    }
    if (booking.acknowledged_at) throw new Error("Your specialist already acknowledged this request.");

    const settings = await serverSettings();
    const addons = booking.addons ?? [];
    const subtotal = Number(booking.hours) * booking.rate + addonsAmount(settings, addons);
    const feePct = booking.platform_fee_pct ?? settings.platform.platformFeePct ?? 12;
    const total = subtotal + Math.round(subtotal * (feePct / 100));

    if (!booking.ack_requested_at) {
      const { error: updateError } = await admin
        .from("bookings")
        .update({ ack_requested_at: new Date().toISOString() })
        .eq("id", booking.id);
      if (updateError) throw new Error(updateError.message);
    }

    const summary = `${booking.service_name} · ${booking.hours}h${
      addons.length ? ` · Add-ons: ${addons.join(", ")}` : ""
    } · GHS ${total.toLocaleString()}`;

    if (booking.thread_id) {
      await admin.from("messages").insert({
        thread_id: booking.thread_id,
        author_id: null,
        kind: "system",
        booking_id: booking.id,
        body: `The member sent this request for acknowledgement — ${summary}. Payment opens once the specialist acknowledges.`,
      });
    }

    await admin.from("notifications").insert({
      user_id: booking.specialist_id,
      kind: "booking",
      title: "Service request awaiting your acknowledgement",
      body: `${summary}. Review the selected services and acknowledge so the member can pay into escrow.`,
      link: booking.thread_id ? `/messages?thread=${booking.thread_id}` : "/messages",
    });

    return { ok: true, total };
  });

/** Specialist acknowledges the requested services, unlocking payment for the client. */
export const acknowledgeBookingRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ bookingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { adminClient } = await import("./payments.server");
    const admin = await adminClient();

    const { data: booking, error } = await admin
      .from("bookings")
      .select("*")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking) throw new Error("That payment request no longer exists.");
    if (booking.specialist_id !== context.userId) {
      throw new Error("Only the assigned specialist can acknowledge this request.");
    }
    if (booking.status === "cancelled") throw new Error("This payment request was cancelled.");
    if (!booking.ack_requested_at) {
      throw new Error("The member hasn't sent this request for acknowledgement yet.");
    }
    if (booking.acknowledged_at) return { ok: true, alreadyAcknowledged: true };

    const { error: updateError } = await admin
      .from("bookings")
      .update({ acknowledged_at: new Date().toISOString(), status: "accepted" })
      .eq("id", booking.id);
    if (updateError) throw new Error(updateError.message);

    const addons = booking.addons ?? [];
    const summary = `${booking.service_name} · ${booking.hours}h${
      addons.length ? ` · Add-ons: ${addons.join(", ")}` : ""
    }`;

    if (booking.thread_id) {
      await admin.from("messages").insert({
        thread_id: booking.thread_id,
        author_id: null,
        kind: "system",
        booking_id: booking.id,
        body: `The specialist acknowledged ${summary}. The member can now pay securely into escrow.`,
      });
    }

    await admin.from("notifications").insert({
      user_id: booking.client_id,
      kind: "booking",
      title: "Your specialist acknowledged the request",
      body: `${summary} is confirmed by your specialist. Open the conversation to pay into Ashnight escrow.`,
      link: booking.thread_id ? `/messages?thread=${booking.thread_id}` : "/messages",
    });

    return { ok: true, alreadyAcknowledged: false };
  });
