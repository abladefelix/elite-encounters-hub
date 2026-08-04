import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const validateCurrentSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const header = getRequestHeader("authorization") ?? "";
    const { validateSession } = await import("./session-management.server");
    const authSessionId = typeof context.claims["session_id"] === "string" ? context.claims["session_id"] : undefined;
    return validateSession(context.userId, header.replace(/^Bearer\s+/i, ""), authSessionId);
  });

export const registerCurrentSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ deviceId: z.string().min(8).max(200), deviceName: z.string().trim().min(2).max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const header = getRequestHeader("authorization") ?? "";
    const { registerSession } = await import("./session-management.server");
    return registerSession({
      userId: context.userId,
      accessToken: header.replace(/^Bearer\s+/i, ""),
      authSessionId: typeof context.claims["session_id"] === "string" ? context.claims["session_id"] : undefined,
      deviceId: data.deviceId,
      deviceName: data.deviceName,
      userAgent: getRequestHeader("user-agent") ?? "",
      ip: getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for") ?? "",
    });
  });

export const endMySessionsAfterPasswordChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { revokeAllSessions } = await import("./session-management.server");
    return revokeAllSessions(context.userId, "Password changed", context.userId);
  });

export const listAdminSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdminArea } = await import("./identity.server");
    const { listSessionsForAdmin } = await import("./session-management.server");
    await assertAdminArea(context.userId, "sessions", "read");
    return listSessionsForAdmin();
  });

export const forceEndSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertAdminArea } = await import("./identity.server");
    const { revokeSession } = await import("./session-management.server");
    await assertAdminArea(context.userId, "sessions");
    return revokeSession(data.sessionId, context.userId);
  });

export const forceEndUserSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertAdminArea } = await import("./identity.server");
    const { revokeAllSessions } = await import("./session-management.server");
    await assertAdminArea(context.userId, "sessions");
    return revokeAllSessions(data.userId, "Ended by an administrator", context.userId);
  });