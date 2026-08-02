/**
 * Finance server functions — admin-only ledger automation.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: {
  supabase: { rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" }) => Promise<{ data: unknown }> };
  userId: string;
}) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (data !== true) throw new Error("Only Ashnight admins can run accounting jobs.");
}

/** Books every escrow payment, payout and refund that isn't in the journal yet. */
export const syncLedgerEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const [{ supabaseAdmin }, { syncLedger }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("./finance.server"),
    ]);
    return syncLedger(supabaseAdmin);
  });
