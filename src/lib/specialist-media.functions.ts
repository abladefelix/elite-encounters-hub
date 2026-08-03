/**
 * Portfolio media server functions.
 *
 * Thin wrappers only — logic lives in `specialist-media.server.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PortfolioMedia } from "./specialist-media.server";

/** Photos and intro clip of a listed specialist, for a signed-in member. */
export const getSpecialistMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ specialistId: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<PortfolioMedia> => {
    const { assertListedSpecialist, readPortfolio } = await import("./specialist-media.server");
    await assertListedSpecialist(data.specialistId);
    return readPortfolio(data.specialistId);
  });

/** The caller's own portfolio, so they can review and replace it. */
export const getMyPortfolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PortfolioMedia> => {
    const { readPortfolio } = await import("./specialist-media.server");
    return readPortfolio(context.userId);
  });

/** Replaces the caller's portfolio photo list and intro clip. */
export const saveMyPortfolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        photoPaths: z.array(z.string().min(1).max(400)).max(12),
        videoPath: z.string().min(1).max(400).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<PortfolioMedia> => {
    const { readPortfolio, writePortfolio } = await import("./specialist-media.server");
    await writePortfolio(context.userId, data.photoPaths, data.videoPath);
    return readPortfolio(context.userId);
  });
