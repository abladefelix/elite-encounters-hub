import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const requireActiveSession = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const token = getRequest().headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const { validateSession } = await import("./session-management.server");
    const result = await validateSession(context.userId, token);
    if (!result.valid) throw new Error(`Unauthorized: ${result.reason}`);
    return next();
  });