/**
 * Admin account actions: create members by hand, edit every field of an
 * account, change credentials and roles, or delete an account outright.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const roles = z.array(z.enum(["client", "specialist", "admin"]));

const fields = z
  .object({
    display_name: z.string().trim().min(2).max(80),
    username: z.string().trim().max(32).nullable(),
    city: z.string().trim().max(80),
    address: z.string().trim().max(200),
    locality: z.string().trim().max(120),
    phone: z.string().trim().max(32).nullable(),
    headline: z.string().trim().max(140),
    bio: z.string().trim().max(2000),
    avatar_url: z.string().trim().max(500).nullable(),
    hourly_rate: z.number().min(0).max(100000),
    years_experience: z.number().min(0).max(70),
    response_minutes: z.number().min(0).max(10080),
    languages: z.array(z.string().trim().max(40)).max(20),
    likes: z.array(z.string().trim().max(60)).max(30),
    dislikes: z.array(z.string().trim().max(60)).max(30),
    room: z.enum(["basic", "premium", "ultimate"]).nullable(),
    vetting: z.enum(["pending", "in_review", "approved", "rejected"]),
    verified: z.boolean(),
    available: z.boolean(),
    suspended: z.boolean(),
    jobs_completed: z.number().min(0).max(100000),
    ghana_card_number: z.string().trim().max(32).nullable(),
    ghana_card_expiry: z.string().trim().max(20).nullable(),
    account_status: z.enum(["pending", "active", "deactivated", "suspended", "banned"]),
    status_reason: z.string().trim().max(500),
  })
  .partial();

/** Email, verification state and roles for one account. */
export const getUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("./identity.server");
    const { getAccount } = await import("./admin-users.server");
    await assertAdmin(context.userId);
    return getAccount(data.userId);
  });

export const createUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        email: z.string().trim().min(5).max(254),
        password: z.string().min(8).max(200),
        roles,
        fields,
        notifyUser: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("./identity.server");
    const { createUser } = await import("./admin-users.server");
    await assertAdmin(context.userId);
    return createUser({ ...data, actorId: context.userId });
  });

export const updateUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        fields,
        email: z.string().trim().max(254).optional(),
        password: z.string().max(200).optional(),
        roles: roles.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("./identity.server");
    const { updateUser } = await import("./admin-users.server");
    await assertAdmin(context.userId);
    return updateUser({ ...data, actorId: context.userId });
  });

export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("./identity.server");
    const { deleteUser } = await import("./admin-users.server");
    await assertAdmin(context.userId);
    if (data.userId === context.userId) throw new Error("You can't delete your own admin account.");
    return deleteUser(data.userId, context.userId);
  });
