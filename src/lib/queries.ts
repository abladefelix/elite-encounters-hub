/**
 * Real data layer.
 *
 * Every read and write below goes to the live database through the browser
 * client, so row-level security decides what each member can actually see.
 * There is no mock data and no localStorage behind any of these calls.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];
export type ProfileRow = Tables["profiles"]["Row"];
export type ServiceRow = Tables["services"]["Row"];
export type ApplicationRow = Tables["applications"]["Row"];
export type ThreadRow = Tables["threads"]["Row"];
export type MessageRow = Tables["messages"]["Row"];
export type BookingRow = Tables["bookings"]["Row"];
export type EscrowRow = Tables["escrow_entries"]["Row"];
export type ReportRow = Tables["reports"]["Row"];
export type RatingRow = Tables["ratings"]["Row"];
export type ModerationHitRow = Tables["moderation_hits"]["Row"];
export type MembershipRow = Tables["memberships"]["Row"];
export type Tier = Database["public"]["Enums"]["tier"];

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as T;
}

/* ------------------------------------------------------------------ profiles */

export function useSpecialists(room?: Tier | "all") {
  return useQuery({
    queryKey: ["specialists", room ?? "all"],
    queryFn: async () => {
      // Clients also hold a room (their membership tier), so the directory is
      // scoped to accounts that actually carry the specialist role.
      const roles = unwrap<{ user_id: string }[]>(
        await supabase.from("user_roles").select("user_id").eq("role", "specialist"),
      );
      const ids = roles.map((row) => row.user_id);
      if (!ids.length) return [] as ProfileRow[];

      let query = supabase
        .from("profiles")
        .select("*")
        .in("id", ids)
        .eq("vetting", "approved")
        .eq("suspended", false)
        .not("room", "is", null)
        .order("rating", { ascending: false });
      if (room && room !== "all") query = query.eq("room", room);
      return unwrap<ProfileRow[]>(await query);
    },
  });
}


export function useProfile(id: string | undefined) {
  return useQuery({
    queryKey: ["profile", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useAllProfiles() {
  return useQuery({
    queryKey: ["profiles", "all"],
    queryFn: async () =>
      unwrap<ProfileRow[]>(
        await supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      ),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Tables["profiles"]["Update"] }) => {
      const { error } = await supabase.from("profiles").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["profile", variables.id] });
      void queryClient.invalidateQueries({ queryKey: ["profiles"] });
      void queryClient.invalidateQueries({ queryKey: ["specialists"] });
    },
  });
}

/** Uploads to the private avatar store and returns a long-lived signed URL. */
export async function uploadAvatar(userId: string, file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${userId}/avatar-${Date.now()}.${extension}`;
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(error.message);
  const { data, error: signError } = await supabase.storage
    .from("avatars")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signError) throw new Error(signError.message);
  return data.signedUrl;
}

/** Looks up several members at once — used to name the other side of a thread. */
export function useProfilesByIds(ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ["profiles", "by-ids", key.join(",")],
    enabled: key.length > 0,
    queryFn: async () =>
      unwrap<ProfileRow[]>(await supabase.from("profiles").select("*").in("id", key)),
  });
}

/** Uploads a chat attachment and returns a signed URL the thread can render. */
export async function uploadAttachment(threadId: string, file: File) {
  const { data: auth } = await supabase.auth.getUser();
  const owner = auth.user?.id;
  if (!owner) throw new Error("Sign in again to share attachments.");
  // Storage rules scope writes to the uploader's own folder.
  const path = `${owner}/${threadId}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
  const { error } = await supabase.storage
    .from("attachments")
    .upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  const { data, error: signError } = await supabase.storage
    .from("attachments")
    .createSignedUrl(path, 60 * 60 * 24 * 30);
  if (signError) throw new Error(signError.message);
  return data.signedUrl;
}

/* ------------------------------------------------------------------ services */

export function useServices(includeInactive = false) {
  return useQuery({
    queryKey: ["services", includeInactive],
    queryFn: async () => {
      let query = supabase.from("services").select("*").order("sort_order").order("name");
      if (!includeInactive) query = query.eq("active", true);
      return unwrap<ServiceRow[]>(await query);
    },
  });
}

export function useServiceMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["services"] });

  const create = useMutation({
    mutationFn: async (input: Tables["services"]["Insert"]) => {
      const { error } = await supabase.from("services").insert(input);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Tables["services"]["Update"] }) => {
      const { error } = await supabase.from("services").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("services").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

export function useSpecialistServices(specialistId: string | undefined) {
  return useQuery({
    queryKey: ["specialist-services", specialistId],
    enabled: Boolean(specialistId),
    queryFn: async () =>
      unwrap<{ service_id: string }[]>(
        await supabase
          .from("specialist_services")
          .select("service_id")
          .eq("specialist_id", specialistId!),
      ),
  });
}

export function useSetSpecialistServices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      specialistId,
      serviceIds,
    }: {
      specialistId: string;
      serviceIds: string[];
    }) => {
      const { error: deleteError } = await supabase
        .from("specialist_services")
        .delete()
        .eq("specialist_id", specialistId);
      if (deleteError) throw new Error(deleteError.message);
      if (serviceIds.length) {
        const { error } = await supabase
          .from("specialist_services")
          .insert(serviceIds.map((service_id) => ({ specialist_id: specialistId, service_id })));
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: (_d, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["specialist-services", variables.specialistId],
      });
    },
  });
}

/* -------------------------------------------------------------- applications */

export function useApplications() {
  return useQuery({
    queryKey: ["applications"],
    queryFn: async () =>
      unwrap<ApplicationRow[]>(
        await supabase.from("applications").select("*").order("created_at", { ascending: false }),
      ),
  });
}

export function useSubmitApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Tables["applications"]["Insert"]) => {
      const { error } = await supabase.from("applications").insert(input);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications"] }),
  });
}

export function useReviewApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Tables["applications"]["Update"];
    }) => {
      const { error } = await supabase.from("applications").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
      void queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
}

/* --------------------------------------------------------- threads + messages */

export function useThreads(userId: string | undefined) {
  const queryClient = useQueryClient();
  const instanceId = useId();

  const query = useQuery({
    queryKey: ["threads", userId],
    enabled: Boolean(userId),
    queryFn: async () =>
      unwrap<ThreadRow[]>(
        await supabase
          .from("threads")
          .select("*")
          .order("last_message_at", { ascending: false }),
      ),
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`threads-${userId}-${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "threads" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["threads", userId] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient, instanceId]);

  return query;
}

export function useMessages(threadId: string | undefined) {
  const queryClient = useQueryClient();
  const instanceId = useId();

  const query = useQuery({
    queryKey: ["messages", threadId],
    enabled: Boolean(threadId),
    queryFn: async () =>
      unwrap<MessageRow[]>(
        await supabase
          .from("messages")
          .select("*")
          .eq("thread_id", threadId!)
          .order("created_at"),
      ),
  });

  useEffect(() => {
    if (!threadId) return;
    const channel = supabase
      .channel(`messages-${threadId}-${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `thread_id=eq.${threadId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["messages", threadId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [threadId, queryClient, instanceId]);

  return query;
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Tables["messages"]["Insert"]) => {
      const { data, error } = await supabase.from("messages").insert(input).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (message) => {
      void queryClient.invalidateQueries({ queryKey: ["messages", message.thread_id] });
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
  });
}

/** Finds the existing conversation between two members, or opens a new one. */
export async function openThread(clientId: string, specialistId: string, room: Tier | null) {
  const existing = await supabase
    .from("threads")
    .select("*")
    .eq("client_id", clientId)
    .eq("specialist_id", specialistId)
    .maybeSingle();
  if (existing.data) return existing.data;

  const { data, error } = await supabase
    .from("threads")
    .insert({ client_id: clientId, specialist_id: specialistId, room })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function markThreadRead(threadId: string, side: "client" | "specialist") {
  const now = new Date().toISOString();
  const patch: Tables["threads"]["Update"] =
    side === "client" ? { client_last_read_at: now } : { specialist_last_read_at: now };
  await supabase.from("threads").update(patch).eq("id", threadId);
}

/* ------------------------------------------------------------------ bookings */

export function useBookings() {
  return useQuery({
    queryKey: ["bookings"],
    queryFn: async () =>
      unwrap<BookingRow[]>(
        await supabase.from("bookings").select("*").order("created_at", { ascending: false }),
      ),
  });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Tables["bookings"]["Insert"]) => {
      const { data, error } = await supabase.from("bookings").insert(input).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bookings"] }),
  });
}

export function useUpdateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Tables["bookings"]["Update"] }) => {
      const { error } = await supabase.from("bookings").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bookings"] }),
  });
}

/* -------------------------------------------------------------------- escrow */

export function useEscrowEntries(threadId?: string) {
  const queryClient = useQueryClient();
  const instanceId = useId();

  const query = useQuery({
    queryKey: ["escrow", threadId ?? "all"],
    queryFn: async () => {
      let request = supabase
        .from("escrow_entries")
        .select("*")
        .order("created_at", { ascending: false });
      if (threadId) request = request.eq("thread_id", threadId);
      return unwrap<EscrowRow[]>(await request);
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`escrow-${threadId ?? "all"}-${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "escrow_entries" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["escrow"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [threadId, queryClient, instanceId]);

  return query;
}

export function useEscrowMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["escrow"] });

  const create = useMutation({
    mutationFn: async (input: Tables["escrow_entries"]["Insert"]) => {
      const { data, error } = await supabase.from("escrow_entries").insert(input).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Tables["escrow_entries"]["Update"];
    }) => {
      const { error } = await supabase.from("escrow_entries").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  return { create, update };
}

/* ------------------------------------------------- moderation, reports, ratings */

export function useModerationHits() {
  return useQuery({
    queryKey: ["moderation-hits"],
    queryFn: async () =>
      unwrap<ModerationHitRow[]>(
        await supabase
          .from("moderation_hits")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200),
      ),
  });
}

export function useLogModerationHit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Tables["moderation_hits"]["Insert"]) => {
      const { error } = await supabase.from("moderation_hits").insert(input);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["moderation-hits"] }),
  });
}

export function useReports() {
  return useQuery({
    queryKey: ["reports"],
    queryFn: async () =>
      unwrap<ReportRow[]>(
        await supabase.from("reports").select("*").order("created_at", { ascending: false }),
      ),
  });
}

export function useReportMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["reports"] });

  const create = useMutation({
    mutationFn: async (input: Tables["reports"]["Insert"]) => {
      const { error } = await supabase.from("reports").insert(input);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Tables["reports"]["Update"] }) => {
      const { error } = await supabase.from("reports").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("reports").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

export function useRatings(ratedId?: string) {
  return useQuery({
    queryKey: ["ratings", ratedId ?? "all"],
    queryFn: async () => {
      let request = supabase
        .from("ratings")
        .select("*")
        .order("created_at", { ascending: false });
      if (ratedId) request = request.eq("rated_id", ratedId);
      return unwrap<RatingRow[]>(await request);
    },
  });
}

export function useSubmitRating() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Tables["ratings"]["Insert"]) => {
      const { error } = await supabase.from("ratings").insert(input);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ratings"] });
      void queryClient.invalidateQueries({ queryKey: ["specialists"] });
    },
  });
}

/* --------------------------------------------------------------- memberships */

export function useMemberships() {
  return useQuery({
    queryKey: ["memberships"],
    queryFn: async () =>
      unwrap<MembershipRow[]>(
        await supabase.from("memberships").select("*").order("created_at", { ascending: false }),
      ),
  });
}
