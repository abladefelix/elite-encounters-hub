import { createServerFn } from "@tanstack/react-start";

import { requireActiveSession } from "@/lib/active-session-middleware";

export const listBookableGroups = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("specialist_groups")
      .select("id, name, slug, description, cover_url, room, pricing_model, base_rate, capacity, available, specialist_group_members(id, specialist_id, role_label, is_lead, share_pct, profiles!specialist_group_members_specialist_id_fkey(id, display_name, avatar_url, rating, jobs_completed, city, vetting, account_status, suspended)), specialist_group_services(id, service_id, rate, minimum_hours, services(id, name, description, active))")
      .eq("active", true)
      .eq("available", true)
      .eq("specialist_group_members.active", true)
      .eq("specialist_group_services.active", true)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const groups = data ?? [];
    const specialistIds = [...new Set(groups.flatMap((group) => group.specialist_group_members.map((member) => member.specialist_id)))];
    if (specialistIds.length === 0) return [];
    const { data: roleRows, error: roleError } = await context.supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "specialist")
      .in("user_id", specialistIds);
    if (roleError) throw new Error(roleError.message);
    const specialistRoleIds = new Set((roleRows ?? []).map((row) => row.user_id));
    return groups.flatMap((group) => {
      const members = group.specialist_group_members.filter((member) =>
        specialistRoleIds.has(member.specialist_id)
        && member.profiles?.vetting === "approved"
        && member.profiles.account_status === "active"
        && !member.profiles.suspended,
      );
      const services = group.specialist_group_services.filter((service) => service.services?.active);
      const shareTotal = members.reduce((total, member) => total + Number(member.share_pct), 0);
      if (members.length === 0 || members.filter((member) => member.is_lead).length !== 1 || Math.abs(shareTotal - 100) > 0.001 || services.length === 0) return [];
      return [{ ...group, specialist_group_members: members, specialist_group_services: services }];
    });
  });