/**
 * Guarded reads of complete member records.
 *
 * Contact details and Ghana Card columns are not granted to signed-in members
 * at all, so the only way to read them is through these server functions:
 * a member gets their own row, an admin gets the roster. The old
 * `profiles_full` database view (which ran with elevated rights) is gone.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FullProfile = Record<string, unknown>;

async function isAdmin(supabase: {
  from: (table: "user_roles") => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => { eq: (column: string, value: string) => Promise<{ data: unknown[] | null }> };
    };
  };
}, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin");
  return Array.isArray(data) && data.length > 0;
}

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
    return (data as FullProfile | null) ?? null;
  });

/** Admin roster: every member with the full column set. */
export const listFullProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({}).catch({}).parse(input ?? {}))
  .handler(async ({ context }): Promise<FullProfile[]> => {
    if (!(await isAdmin(context.supabase as never, context.userId))) {
      throw new Error("Admin access is required for that.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as FullProfile[];
  });
