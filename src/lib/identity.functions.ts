/**
 * Identity, account-state, notification and investigation server actions.
 *
 * Thin wrappers only — the logic lives in `identity.server.ts` and is imported
 * inside each handler so nothing server-only reaches the browser bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const identifier = z.string().trim().min(3).max(254);

/** Pre-flight check so sign-up can say "that username is taken" before submit. */
export const checkAvailability = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        username: z.string().trim().max(64).optional(),
        email: z.string().trim().max(254).optional(),
        phone: z.string().trim().max(32).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { checkAvailability: run } = await import("./identity.server");
    return run(data);
  });

/** Sign in with a username or an email address. */
export const signInWithIdentifier = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        identifier,
        password: z.string().min(6).max(200),
        captchaToken: z.string().trim().max(2048).optional(),
        deviceId: z.string().min(8).max(200),
        deviceName: z.string().trim().min(2).max(120),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const ip =
        getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for") ?? "";

      // Abuse protection: a forged or replayed challenge never reaches the
      // password check, so credential stuffing costs a Turnstile solve per try.
      const { assertHuman } = await import("./captcha.server");
      await assertHuman(data.captchaToken, { ip, action: "signin" });

      const { signInWithIdentifier: run } = await import("./identity.server");
      const tokens = await run(data.identifier, data.password, {
        ip,
        userAgent: getRequestHeader("user-agent") ?? "",
        deviceId: data.deviceId,
        deviceName: data.deviceName,
      });
      return { ok: true as const, ...tokens };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : "We couldn't sign you in.",
      };
    }
  });


/** Records a client-side event (sign-out, payment start) in the audit trail. */
export const recordActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        event: z.string().trim().min(2).max(64),
        area: z.string().trim().max(32).optional(),
        target: z.string().trim().max(200).optional(),
        severity: z.enum(["info", "warn", "error"]).optional(),
        details: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { logActivity } = await import("./identity.server");
    await logActivity({
      ...data,
      actorId: context.userId,
      ip: getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for") ?? "",
      userAgent: getRequestHeader("user-agent") ?? "",
    });
    return { ok: true };
  });

/** Admin: ban, suspend, deactivate or reactivate an account. */
export const setAccountStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        status: z.enum(["active", "pending", "deactivated", "suspended", "banned"]),
        reason: z.string().trim().max(500).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminArea, setAccountStatus: run } = await import("./identity.server");
    await assertAdminArea(context.userId, "users");
    return run({
      userId: data.userId,
      status: data.status,
      reason: data.reason,
      actorId: context.userId,
      actorLabel: (context.claims as { email?: string })?.email ?? "admin",
    });
  });

/** Admin: send a notification to one member, a room, a role, or everyone. */
export const sendNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        title: z.string().trim().min(2).max(120),
        body: z.string().trim().max(2000).default(""),
        link: z.string().trim().max(300).default(""),
        audience: z.enum(["everyone", "clients", "specialists", "room", "user"]),
        channels: z.array(z.enum(["inApp", "email", "sms"])).min(1).default(["inApp"]),
        room: z.enum(["basic", "premium", "ultimate"]).optional(),
        userId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { admin, assertAdminArea, notify, logActivity } = await import("./identity.server");
    await assertAdminArea(context.userId, "notifications");
    const client = await admin();

    let ids: string[] = [];
    if (data.audience === "user") {
      ids = data.userId ? [data.userId] : [];
    } else if (data.audience === "room") {
      const { data: rows } = await client.from("profiles").select("id").eq("room", data.room!);
      ids = (rows ?? []).map((row) => row.id);
    } else if (data.audience === "everyone") {
      const { data: rows } = await client.from("profiles").select("id");
      ids = (rows ?? []).map((row) => row.id);
    } else {
      const role = data.audience === "clients" ? "client" : "specialist";
      const { data: rows } = await client.from("user_roles").select("user_id").eq("role", role);
      ids = (rows ?? []).map((row) => row.user_id);
    }

    const uniqueIds = [...new Set(ids)];
    const sent = data.channels.includes("inApp") ? await notify(uniqueIds, {
      title: data.title,
      body: data.body,
      link: data.link,
      kind: "announcement",
      sentBy: context.userId,
    }) : 0;

    await logActivity({
      area: "notifications",
      event: "broadcast_sent",
      actorId: context.userId,
      target: data.audience,
      details: { recipients: uniqueIds.length, inboxes: sent, channels: data.channels, title: data.title },
    });

    return {
      sent,
      recipients: uniqueIds.length,
      channels: {
        inApp: data.channels.includes("inApp") ? "sent" : "skipped",
        email: data.channels.includes("email") ? "not_configured" : "skipped",
        sms: data.channels.includes("sms") ? "not_configured" : "skipped",
      },
    };
  });

/** Admin: free up usernames, emails and card numbers from abandoned sign-ups. */
export const releaseAbandonedSignups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ hours: z.number().min(1).max(720) }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertAdminArea, releaseAbandonedSignups: run } = await import("./identity.server");
    await assertAdminArea(context.userId, "users");
    return run(data.hours);
  });

/** Saves the caller's own call preferences without touching other `extra` keys. */
export const saveMyCallPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        acceptCalls: z.boolean(),
        ringWhenClosed: z.boolean(),
        ringtone: z.boolean(),
        vibrate: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { saveCallPreferences } = await import("./identity.server");
    await saveCallPreferences(context.userId, data);
    return { ok: true };
  });

/** Saves the caller's own invoice/receipt delivery choice (email / WhatsApp). */
export const saveMyDocumentDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        email: z.boolean(),
        whatsapp: z.boolean(),
        whatsappNumber: z.string().trim().max(24).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { saveDocumentDelivery } = await import("./identity.server");
    await saveDocumentDelivery(context.userId, data);
    return { ok: true };
  });

/** Saves the caller's answers to the admin's custom profile questions. */
export const saveMyProfileAnswers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({ answers: z.record(z.string(), z.union([z.string().max(2000), z.boolean()])) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { saveProfileFormAnswers } = await import("./identity.server");
    await saveProfileFormAnswers(context.userId, data.answers);
    return { ok: true };
  });

/**
 * Creates a pending member account server-side so the browser never holds a
 * session before an admin approves the applicant.
 */
export const registerMemberAccount = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        email: z.string().trim().email().max(254),
        password: z.string().min(8).max(200),
        metadata: z.record(z.string(), z.unknown()),
        files: z
          .object({
            avatar: z.string().max(200).optional(),
            photos: z.array(z.string().max(200)).max(12).optional(),
            video: z.string().max(200).optional(),
          })
          .optional(),
        emailRedirectTo: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { registerMember } = await import("./identity.server");
    return registerMember(data);
  });
