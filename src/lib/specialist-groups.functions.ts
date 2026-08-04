import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const room = z.enum(["basic", "premium", "ultimate", "room4", "room5", "room6", "room7", "room8"]);
const groupInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(2000),
  coverUrl: z.string().trim().max(500).nullable().optional(),
  room,
  pricingModel: z.enum(["flat", "hourly"]),
  baseRate: z.number().int().positive().max(1_000_000),
  capacity: z.number().int().min(1).max(50),
  available: z.boolean(),
  active: z.boolean(),
  members: z.array(z.object({
    specialistId: z.string().uuid(),
    roleLabel: z.string().trim().min(2).max(80),
    isLead: z.boolean(),
    sharePct: z.number().positive().max(100),
  })).min(1).max(50),
  services: z.array(z.object({
    serviceId: z.string().uuid(),
    rate: z.number().int().positive().max(1_000_000),
    minimumHours: z.number().positive().max(48),
  })).min(1).max(100),
});

export const listAdminGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ assertAdminArea }, { listGroupsForAdmin }] = await Promise.all([
      import("./identity.server"),
      import("./specialist-groups.server"),
    ]);
    await assertAdminArea(context.userId, "groups", "read");
    return listGroupsForAdmin();
  });

export const saveSpecialistGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => groupInput.parse(input))
  .handler(async ({ data, context }) => {
    const [{ assertAdminArea }, { saveGroup }] = await Promise.all([
      import("./identity.server"),
      import("./specialist-groups.server"),
    ]);
    await assertAdminArea(context.userId, "groups");
    return saveGroup({ ...data, actorId: context.userId });
  });

export const changeSpecialistGroupStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const [{ assertAdminArea }, { setGroupActive }] = await Promise.all([
      import("./identity.server"),
      import("./specialist-groups.server"),
    ]);
    await assertAdminArea(context.userId, "groups");
    return setGroupActive(data.id, data.active, context.userId);
  });