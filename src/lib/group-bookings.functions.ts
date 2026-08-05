import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireActiveSession } from "@/lib/active-session-middleware";

export const listBookableGroups = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("specialist_groups")
      .select("id, name, slug, description, cover_url, room, pricing_model, base_rate, capacity, available, specialist_group_members(id, specialist_id, role_label, is_lead, profiles!specialist_group_members_specialist_id_fkey(id, display_name, avatar_url, rating, jobs_completed, city, available)), specialist_group_services(id, service_id, rate, minimum_hours, services(id, name, description))")
      .eq("active", true)
      .eq("available", true)
      .eq("specialist_group_members.active", true)
      .eq("specialist_group_services.active", true)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const requestGroupBooking = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({
    groupId: z.string().uuid(),
    serviceId: z.string().uuid(),
    hours: z.number().positive().max(48),
    scheduledFor: z.string().datetime().nullable().optional(),
    notes: z.string().trim().max(1200).optional(),
    addons: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: snapshot, error } = await supabaseAdmin.rpc("create_group_booking_snapshot", {
      _group_id: data.groupId,
      _service_id: data.serviceId,
      _hours: data.hours,
      _requesting_user: context.userId,
      ...(data.scheduledFor ? { _scheduled_for: data.scheduledFor } : {}),
      _notes: data.notes ?? "",
      _addons: data.addons ?? [],
    });
    if (error) throw new Error(error.message);
    return snapshot as unknown as {
      group_booking_id: string;
      thread_id: string;
      total: number;
      service_name: string;
      status: "requested";
    };
  });

export const getGroupBookingForThread = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ threadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: thread } = await supabaseAdmin
      .from("threads")
      .select("id, client_id, group_booking_id")
      .eq("id", data.threadId)
      .maybeSingle();
    if (!thread?.group_booking_id) return null;
    const { data: participant } = await supabaseAdmin
      .from("thread_participants")
      .select("user_id")
      .eq("thread_id", thread.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!participant) throw new Error("You are not part of this Ash group conversation.");
    const { data: booking, error } = await supabaseAdmin
      .from("group_bookings")
      .select("id, client_id, service_name, scheduled_for, hours, notes, total, status, paid_at, group_booking_members(id, specialist_id, role_label, is_lead, status, payout_amount, profiles!group_booking_members_specialist_id_fkey(display_name, avatar_url))")
      .eq("id", thread.group_booking_id)
      .single();
    if (error) throw new Error(error.message);
    return booking;
  });

export const respondToGroupBooking = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ groupBookingId: z.string().uuid(), available: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("respond_group_booking_availability", {
      _group_booking_id: data.groupBookingId,
      _requesting_user: context.userId,
      _available: data.available,
    });
    if (error) throw new Error(error.message);
    return result;
  });