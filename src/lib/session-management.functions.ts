import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const validateCurrentSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const header = getRequestHeader("authorization") ?? "";
    const { validateSession } = await import("./session-management.server");
    return validateSession(context.userId, header.replace(/^Bearer\s+/i, ""));
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