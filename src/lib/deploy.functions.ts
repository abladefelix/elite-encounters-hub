/**
 * Admin-only deployment actions. Both functions verify the caller holds the
 * admin role through their own session before touching the vault.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: {
  supabase: { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown }> };
  userId: string;
}) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (data !== true) throw new Error("Admins only.");
}

export const getDeployStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { deployStatus } = await import("./deploy.server");
    return deployStatus();
  });

export const syncFromGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { runDeploySync } = await import("./deploy.server");
    const claims = (context as { claims?: { email?: string } }).claims;
    return runDeploySync({
      id: (context as { userId: string }).userId,
      label: claims?.email ?? "admin",
    });
  });
