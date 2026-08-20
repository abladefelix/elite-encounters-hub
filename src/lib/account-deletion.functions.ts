/** Member-initiated account deletion. Permanent, and typed confirmation only. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireActiveSession } from "@/lib/active-session-middleware";

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .validator((input) =>
    z.object({ confirm: z.literal("DELETE") }).parse(input),
  )
  .handler(async ({ context }) => {
    const { deleteOwnAccount } = await import("./account-deletion.server");
    return deleteOwnAccount(context.userId);
  });
