/**
 * Admin-only demo-data actions. Each one re-checks the admin role against the
 * caller's own session before the service-role seeder runs.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireActiveSession as requireSupabaseAuth } from "@/lib/active-session-middleware";

export const getDemoStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdminArea } = await import("./identity.server");
    await assertAdminArea(context.userId, "demo");
    const { demoStatus } = await import("./demo-data.server");
    return demoStatus();
  });

export const populateDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdminArea } = await import("./identity.server");
    await assertAdminArea(context.userId, "demo");
    const { seedDemoData } = await import("./demo-data.server");
    return seedDemoData(context.userId, context.claims?.email ?? "admin");
  });

export const removeDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdminArea } = await import("./identity.server");
    await assertAdminArea(context.userId, "demo");
    const { clearDemoData } = await import("./demo-data.server");
    return clearDemoData(context.userId, context.claims?.email ?? "admin");
  });
