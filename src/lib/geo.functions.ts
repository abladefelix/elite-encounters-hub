/**
 * Public reverse-geocode lookup used by sign-up and the profile service area
 * card, so a member sees the name of the place they just pinned.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const lookupPlaceName = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<{ label: string }> => {
    const { describeCoordinates } = await import("@/lib/geo.server");
    return { label: await describeCoordinates(data.lat, data.lng) };
  });
