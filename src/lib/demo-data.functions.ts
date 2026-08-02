/**
 * Admin-only demo-data actions. Each one re-checks the admin role against the
 * caller's own session before the service-role seeder runs.
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

const actor = (context: unknown) => {
  const ctx = context as { userId: string; claims?: { email?: string } };
  return { id: ctx.userId, label: ctx.claims?.email ?? "admin" };
};

export const getDemoStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { demoStatus } = await import("./demo-data.server");
    return demoStatus();
  });

export const populateDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { seedDemoData } = await import("./demo-data.server");
    const who = actor(context);
    return seedDemoData(who.id, who.label);
  });

export const removeDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { clearDemoData } = await import("./demo-data.server");
    const who = actor(context);
    return clearDemoData(who.id, who.label);
  });
