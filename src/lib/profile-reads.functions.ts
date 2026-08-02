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

/**
 * Postgres/PostgREST rejects a token whose `iat` sits ahead of the database
 * clock ("JWT issued at future"). That is pure clock drift between the app
 * server and the database, and it clears within a second — so retry briefly
 * instead of surfacing a fatal error that blanks the signed-in shell.
 */
function isClockDrift(message: string | undefined) {
  return Boolean(message && /issued at future|JWSInvalidSignature|iat/i.test(message));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The caller's own record, including their contact and identity columns. */
export const getMyFullProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FullProfile | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", context.userId)
        .maybeSingle();
      if (!error) return data ?? null;
      if (!isClockDrift(error.message)) throw new Error(error.message);
      await sleep(400 * (attempt + 1));
    }
    // Still drifting: hand back nothing so the UI keeps its cached profile.
    return null;
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
    let data: Database["public"]["Tables"]["profiles"]["Row"][] | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await supabaseAdmin
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (!result.error) {
        data = result.data;
        break;
      }
      if (!isClockDrift(result.error.message)) throw new Error(result.error.message);
      await sleep(400 * (attempt + 1));
    }


    const { data: allRoles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const byUser = new Map<string, Database["public"]["Enums"]["app_role"][]>();
    for (const row of allRoles ?? []) {
      const list = byUser.get(row.user_id) ?? [];
      list.push(row.role);
      byUser.set(row.user_id, list);
    }
    return (data ?? []).map((row) => ({ ...row, roles: byUser.get(row.id) ?? [] }));
  });
