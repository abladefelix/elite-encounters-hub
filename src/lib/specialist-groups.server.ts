import type { Database } from "@/integrations/supabase/types";

type Tier = Database["public"]["Enums"]["tier"];

export interface GroupMemberInput {
  specialistId: string;
  roleLabel: string;
  isLead: boolean;
  sharePct: number;
}

export interface GroupServiceInput {
  serviceId: string;
  rate: number;
  minimumHours: number;
}

export interface SaveGroupInput {
  id?: string | undefined;
  name: string;
  slug: string;
  description: string;
  coverUrl?: string | null | undefined;
  room: Tier;
  pricingModel: "flat" | "hourly";
  baseRate: number;
  capacity: number;
  available: boolean;
  active: boolean;
  members: GroupMemberInput[];
  services: GroupServiceInput[];
  actorId: string;
}

async function client() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function validateStructure(input: SaveGroupInput) {
  if (!input.members.length) throw new Error("Add at least one specialist to the group.");
  if (input.members.filter((member) => member.isLead).length !== 1) {
    throw new Error("Choose exactly one group lead.");
  }
  const uniqueMembers = new Set(input.members.map((member) => member.specialistId));
  if (uniqueMembers.size !== input.members.length) throw new Error("A specialist can only appear once.");
  const shareTotal = input.members.reduce((sum, member) => sum + member.sharePct, 0);
  if (Math.abs(shareTotal - 100) > 0.001) {
    throw new Error(`Payout shares must total 100%. They currently total ${shareTotal.toFixed(2)}%.`);
  }
  if (!input.services.length) throw new Error("Add at least one service to the group.");
  if (new Set(input.services.map((service) => service.serviceId)).size !== input.services.length) {
    throw new Error("A service can only appear once.");
  }
}

export async function listGroupsForAdmin() {
  const admin = await client();
  const { data, error } = await admin
    .from("specialist_groups")
    .select("*, specialist_group_members(*, profiles!specialist_group_members_specialist_id_fkey(id, display_name, avatar_url, vetting, account_status)), specialist_group_services(*, services(id, name, active))")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function saveGroup(input: SaveGroupInput) {
  validateStructure(input);
  const admin = await client();
  const specialistIds = input.members.map((member) => member.specialistId);
  const { data: specialists, error: specialistError } = await admin
    .from("profiles")
    .select("id, vetting, account_status, suspended")
    .in("id", specialistIds);
  if (specialistError) throw new Error(specialistError.message);
  const validIds = new Set(
    (specialists ?? [])
      .filter((row) => row.vetting === "approved" && row.account_status === "active" && !row.suspended)
      .map((row) => row.id),
  );
  if (specialistIds.some((id) => !validIds.has(id))) {
    throw new Error("Every group member must be an active, approved specialist.");
  }
  const { data: roles, error: roleError } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("role", "specialist")
    .in("user_id", specialistIds);
  if (roleError) throw new Error(roleError.message);
  if (new Set((roles ?? []).map((row) => row.user_id)).size !== specialistIds.length) {
    throw new Error("Every selected member must hold the specialist role.");
  }

  let groupId = input.id;
  if (groupId) {
    const { error } = await admin.from("specialist_groups").update({ active: false }).eq("id", groupId);
    if (error) throw new Error(error.message);
    const [membersDelete, servicesDelete] = await Promise.all([
      admin.from("specialist_group_members").delete().eq("group_id", groupId),
      admin.from("specialist_group_services").delete().eq("group_id", groupId),
    ]);
    if (membersDelete.error) throw new Error(membersDelete.error.message);
    if (servicesDelete.error) throw new Error(servicesDelete.error.message);
    const { error: updateError } = await admin
      .from("specialist_groups")
      .update({
        name: input.name,
        slug: input.slug,
        description: input.description,
        cover_url: input.coverUrl ?? null,
        room: input.room,
        pricing_model: input.pricingModel,
        base_rate: input.baseRate,
        capacity: input.capacity,
        available: input.available,
      })
      .eq("id", groupId);
    if (updateError) throw new Error(updateError.message);
  } else {
    const { data: created, error } = await admin
      .from("specialist_groups")
      .insert({
        name: input.name,
        slug: input.slug,
        description: input.description,
        cover_url: input.coverUrl ?? null,
        room: input.room,
        pricing_model: input.pricingModel,
        base_rate: input.baseRate,
        capacity: input.capacity,
        available: input.available,
        active: false,
        created_by: input.actorId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    groupId = created.id;
  }

  const { error: memberError } = await admin.from("specialist_group_members").insert(
    input.members.map((member) => ({
      group_id: groupId as string,
      specialist_id: member.specialistId,
      role_label: member.roleLabel,
      is_lead: member.isLead,
      share_pct: member.sharePct,
      active: true,
      added_by: input.actorId,
    })),
  );
  if (memberError) throw new Error(memberError.message);
  const { error: serviceError } = await admin.from("specialist_group_services").insert(
    input.services.map((service) => ({
      group_id: groupId as string,
      service_id: service.serviceId,
      rate: service.rate,
      minimum_hours: service.minimumHours,
      active: true,
    })),
  );
  if (serviceError) throw new Error(serviceError.message);
  if (input.active) {
    const { error } = await admin.from("specialist_groups").update({ active: true }).eq("id", groupId);
    if (error) throw new Error(error.message);
  }
  await admin.from("admin_audit_log").insert({
    actor_id: input.actorId,
    area: "groups",
    action: input.id ? "group.updated" : "group.created",
    target: groupId,
    note: `${input.name} · ${input.members.length} specialists · ${input.active ? "active" : "draft"}`,
    details: { members: specialistIds, services: input.services.map((service) => service.serviceId) },
  });
  return { id: groupId };
}

export async function setGroupActive(id: string, active: boolean, actorId: string) {
  const admin = await client();
  const { error } = await admin.from("specialist_groups").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  await admin.from("admin_audit_log").insert({
    actor_id: actorId,
    area: "groups",
    action: active ? "group.activated" : "group.deactivated",
    target: id,
    note: active ? "Group opened for client booking." : "Group hidden from new bookings.",
  });
  return { ok: true };
}