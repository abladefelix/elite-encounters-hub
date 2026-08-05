import { createServerFn } from "@tanstack/react-start";

import { requireActiveSession } from "@/lib/active-session-middleware";

export const listBookableGroups = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("specialist_groups")
      .select("id, name, slug, description, cover_url, room, pricing_model, base_rate, capacity, available, specialist_group_members(id, specialist_id, role_label, is_lead, profiles!specialist_group_members_specialist_id_fkey(id, display_name, avatar_url, rating, jobs_completed, city)), specialist_group_services(id, service_id, rate, minimum_hours, services(id, name, description))")
      .eq("active", true)
      .eq("available", true)
      .eq("specialist_group_members.active", true)
      .eq("specialist_group_services.active", true)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).filter((group) => group.specialist_group_members.length > 0 && group.specialist_group_services.length > 0);
  });