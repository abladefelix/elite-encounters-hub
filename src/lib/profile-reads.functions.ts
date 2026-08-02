/**
 * Guarded reads of complete member records.
 *
 * Contact details and Ghana Card columns are not granted to signed-in members
 * at all, so the only way to read them is through these server functions:
 * a member gets their own row, an admin gets the roster. The old
 * `profiles_full` database view (which ran with elevated rights) is gone.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export type FullProfile = Database["public"]["Tables"]["profiles"]["Row"] & {
  /** Roles held by the account, so the admin roster can split clients from specialists. */
  roles?: Database["public"]["Enums"]["app_role"][];
};

/** The caller's own record, including their contact and identity columns. */
export const getMyFullProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FullProfile | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  });

/** Admin roster: every member with the full column set. */
export const listFullProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FullProfile[]> => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin");
    if (!roles?.length) throw new Error("Admin access is required for that.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const { data: allRoles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const byUser = new Map<string, Database["public"]["Enums"]["app_role"][]>();
    for (const row of allRoles ?? []) {
      const list = byUser.get(row.user_id) ?? [];
      list.push(row.role);
      byUser.set(row.user_id, list);
    }
    return (data ?? []).map((row) => ({ ...row, roles: byUser.get(row.id) ?? [] }));
  });
