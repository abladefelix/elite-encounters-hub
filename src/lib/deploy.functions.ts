/**
 * Admin-only deployment actions. Both functions verify the caller holds the
 * admin role through their own session before touching the vault.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin gate for this area. Holding the admin role is not enough — the caller's
 * assigned areas and read-only flag are enforced server-side as well.
 */
async function assertAdminArea(context: { userId: string }) {
  const { assertAdminArea: gate } = await import("./identity.server");
  await gate(context.userId, "deploy");
}

export const getDeployStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminArea(context as never);
    const { deployStatus } = await import("./deploy.server");
    return deployStatus();
  });

export const syncFromGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminArea(context as never);
    const { runDeploySync } = await import("./deploy.server");
    const claims = (context as { claims?: { email?: string } }).claims;
    return runDeploySync({
      id: (context as { userId: string }).userId,
      label: claims?.email ?? "admin",
    });
  });
