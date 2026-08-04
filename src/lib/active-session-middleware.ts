import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const requireActiveSession = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const request = getRequest();
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const authSessionId = typeof context.claims["session_id"] === "string" ? context.claims["session_id"] : undefined;
    const { registerSession, validateSession } = await import("./session-management.server");
    let result = await validateSession(context.userId, token, authSessionId);
    if (!result.valid && result.reason === "This session is no longer registered.") {
      await registerSession({
        userId: context.userId,
        accessToken: token,
        ...(authSessionId ? { authSessionId } : {}),
        deviceId: `existing-${context.userId}`,
        deviceName: "Existing signed-in device",
        userAgent: request.headers.get("user-agent") ?? "",
        ip: request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "",
      });
      result = await validateSession(context.userId, token, authSessionId);
    }
    if (!result.valid) throw new Error(`Unauthorized: ${result.reason}`);
    return next();
  });