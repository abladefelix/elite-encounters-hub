/**
 * Admin-only deployment actions. Both functions verify the caller holds the
 * admin role through their own session before touching the vault.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: {
  supabase: {
    from: (table: "user_roles") => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string,
        ) => { eq: (column: string, value: string) => Promise<{ data: unknown[] | null }> };
      };
    };
  };
  userId: string;
}) {
  // Role is read from `user_roles` under the caller's own session — the helper
  // functions behind RLS are no longer callable over the API.
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin");
  if (!data?.length) throw new Error("Admins only.");
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
