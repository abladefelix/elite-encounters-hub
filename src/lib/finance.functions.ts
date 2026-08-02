/**
 * Finance server functions — admin-only ledger automation.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdminArea(context: {
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
  if (!data?.length) throw new Error("Only Ashnight admins can run accounting jobs.");
}

/** Books every escrow payment, payout and refund that isn't in the journal yet. */
export const syncLedgerEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminArea(context as never);
    const [{ supabaseAdmin }, { syncLedger }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("./finance.server"),
    ]);
    return syncLedger(supabaseAdmin);
  });
