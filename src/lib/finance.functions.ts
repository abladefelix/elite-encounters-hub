/**
 * Finance server functions — admin-only ledger automation.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireActiveSession as requireSupabaseAuth } from "@/lib/active-session-middleware";

/**
 * Admin gate for this area. Holding the admin role is not enough — the caller's
 * assigned areas and read-only flag are enforced server-side as well.
 */
async function assertAdminArea(context: { userId: string }) {
  const { assertAdminArea: gate } = await import("./identity.server");
  await gate(context.userId, "finance");
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
