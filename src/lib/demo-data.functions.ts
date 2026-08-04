/**
 * Admin-only demo-data actions. Each one re-checks the admin role against the
 * caller's own session before the service-role seeder runs.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireActiveSession as requireSupabaseAuth } from "@/lib/active-session-middleware";

/**
 * Admin gate for this area. Holding the admin role is not enough — the caller's
 * assigned areas and read-only flag are enforced server-side as well.
 */
async function assertAdminArea(context: { userId: string }) {
  const { assertAdminArea: gate } = await import("./identity.server");
  await gate(context.userId, "demo");
}

const actor = (context: unknown) => {
  const ctx = context as { userId: string; claims?: { email?: string } };
  return { id: ctx.userId, label: ctx.claims?.email ?? "admin" };
};

export const getDemoStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminArea(context as never);
    const { demoStatus } = await import("./demo-data.server");
    return demoStatus();
  });

export const populateDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminArea(context as never);
    const { seedDemoData } = await import("./demo-data.server");
    const who = actor(context);
    return seedDemoData(who.id, who.label);
  });

export const removeDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminArea(context as never);
    const { clearDemoData } = await import("./demo-data.server");
    const who = actor(context);
    return clearDemoData(who.id, who.label);
  });
