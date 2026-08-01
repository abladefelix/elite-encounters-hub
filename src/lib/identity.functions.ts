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
  .inputValidator((input) =>
    z
      .object({
        username: z.string().trim().max(64).optional(),
        email: z.string().trim().max(254).optional(),
        phone: z.string().trim().max(32).optional(),
        ghanaCard: z.string().trim().max(32).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { checkAvailability: run } = await import("./identity.server");
    return run(data);
  });

/** Sign in with a username or an email address. */
export const signInWithIdentifier = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ identifier, password: z.string().min(6).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { signInWithIdentifier: run } = await import("./identity.server");
    return run(data.identifier, data.password, {
      ip: getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for") ?? "",
      userAgent: getRequestHeader("user-agent") ?? "",
    });
  });

/** Records a client-side event (sign-out, payment start) in the audit trail. */
export const recordActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
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
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        status: z.enum(["active", "pending", "deactivated", "suspended", "banned"]),
        reason: z.string().trim().max(500).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin, setAccountStatus: run } = await import("./identity.server");
    await assertAdmin(context.userId);
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
  .inputValidator((input) =>
    z
      .object({
        title: z.string().trim().min(2).max(120),
        body: z.string().trim().max(2000).default(""),
        link: z.string().trim().max(300).default(""),
        audience: z.enum(["everyone", "clients", "specialists", "room", "user"]),
        room: z.enum(["basic", "premium", "ultimate"]).optional(),
        userId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { admin, assertAdmin, notify, logActivity } = await import("./identity.server");
    await assertAdmin(context.userId);
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

    const sent = await notify([...new Set(ids)], {
      title: data.title,
      body: data.body,
      link: data.link,
      kind: "announcement",
      sentBy: context.userId,
    });

    await logActivity({
      area: "notifications",
      event: "broadcast_sent",
      actorId: context.userId,
      target: data.audience,
      details: { recipients: sent, title: data.title },
    });

    return { sent };
  });

/** Admin: free up usernames, emails and card numbers from abandoned sign-ups. */
export const releaseAbandonedSignups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ hours: z.number().min(1).max(720) }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertAdmin, releaseAbandonedSignups: run } = await import("./identity.server");
    await assertAdmin(context.userId);
    return run(data.hours);
  });
