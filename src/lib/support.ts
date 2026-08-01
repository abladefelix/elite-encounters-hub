/**
 * Notifications, complaints, documents and the activity log.
 *
 * Reads go straight through row-level security, so a member only ever sees
 * their own rows while an admin sees everything.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];
export type NotificationRow = Tables["notifications"]["Row"];
export type ComplaintRow = Tables["complaints"]["Row"];
export type DocumentRow = Tables["documents"]["Row"];
export type ActivityRow = Tables["activity_log"]["Row"];
export type ComplaintState = Database["public"]["Enums"]["complaint_state"];
export type DocumentKind = Database["public"]["Enums"]["document_kind"];

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as T;
}

/* ------------------------------------------------------------ notifications */

export function useNotifications(userId: string | undefined) {
  const queryClient = useQueryClient();
  // Each hook instance needs its own channel name: reusing one name means the
  // second subscriber gets the already-subscribed channel back and `.on()` throws.
  const instanceId = useId();

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-${userId}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => void queryClient.invalidateQueries({ queryKey: ["notifications", userId] }),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [queryClient, userId, instanceId]);

  return useQuery({
    queryKey: ["notifications", userId],
    enabled: !!userId,
    queryFn: async () =>
      unwrap<NotificationRow[]>(
        await supabase
          .from("notifications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(60),
      ),
  });
}

export function useNotificationMutations(userId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  return { markRead, markAllRead };
}

/** Every notification the control room has ever delivered. */
export function useAllNotifications() {
  return useQuery({
    queryKey: ["notifications", "all"],
    queryFn: async () =>
      unwrap<NotificationRow[]>(
        await supabase
          .from("notifications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(300),
      ),
  });
}

/* ---------------------------------------------------------------- complaints */

export const COMPLAINT_CATEGORIES = [
  "Payment or refund",
  "Specialist conduct",
  "Member conduct",
  "Ash quality",
  "Account access",
  "Something else",
];

export function useComplaints() {
  return useQuery({
    queryKey: ["complaints"],
    queryFn: async () =>
      unwrap<ComplaintRow[]>(
        await supabase.from("complaints").select("*").order("created_at", { ascending: false }),
      ),
  });
}

export function useComplaintMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["complaints"] });

  const raise = useMutation({
    mutationFn: async (input: {
      userId: string;
      category: string;
      subject: string;
      body: string;
      contactEmail?: string;
      threadId?: string | null;
      bookingId?: string | null;
    }) => {
      const { error } = await supabase.from("complaints").insert({
        user_id: input.userId,
        category: input.category,
        subject: input.subject,
        body: input.body,
        contact_email: input.contactEmail ?? "",
        thread_id: input.threadId ?? null,
        booking_id: input.bookingId ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async (input: {
      id: string;
      state?: ComplaintState;
      adminNote?: string;
      resolution?: string;
      handledBy?: string;
    }) => {
      const patch: Tables["complaints"]["Update"] = {};
      if (input.state) patch.state = input.state;
      if (input.adminNote !== undefined) patch.admin_note = input.adminNote;
      if (input.resolution !== undefined) patch.resolution = input.resolution;
      if (input.state === "resolved" || input.state === "dismissed") {
        patch.handled_at = new Date().toISOString();
        patch.handled_by = input.handledBy ?? null;
      }
      const { error } = await supabase.from("complaints").update(patch).eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  return { raise, update };
}

/* ----------------------------------------------------------------- documents */

export function useDocuments(kind?: DocumentKind) {
  return useQuery({
    queryKey: ["documents", kind ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("documents")
        .select("*")
        .order("issued_at", { ascending: false })
        .limit(300);
      if (kind) query = query.eq("kind", kind);
      return unwrap<DocumentRow[]>(await query);
    },
  });
}

export interface DocumentLine {
  label: string;
  quantity: number;
  unitAmount: number;
  amount: number;
}

export function documentLines(row: DocumentRow): DocumentLine[] {
  const raw = Array.isArray(row.line_items) ? row.line_items : [];
  return raw.map((item) => {
    const line = (item ?? {}) as Record<string, unknown>;
    return {
      label: String(line["label"] ?? "Ash service"),
      quantity: Number(line["quantity"] ?? 1),
      unitAmount: Number(line["unitAmount"] ?? line["amount"] ?? 0),
      amount: Number(line["amount"] ?? 0),
    };
  });
}

/* -------------------------------------------------------------- activity log */

export interface ActivityFilters {
  area?: string;
  severity?: string;
  search?: string;
}

export function useActivityLog(filters: ActivityFilters = {}) {
  return useQuery({
    queryKey: ["activity-log", filters],
    queryFn: async () => {
      let query = supabase
        .from("activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(400);
      if (filters.area && filters.area !== "all") query = query.eq("area", filters.area);
      if (filters.severity && filters.severity !== "all")
        query = query.eq("severity", filters.severity);
      if (filters.search) {
        const term = `%${filters.search}%`;
        query = query.or(
          `event.ilike.${term},actor_label.ilike.${term},target.ilike.${term},ip.ilike.${term}`,
        );
      }
      return unwrap<ActivityRow[]>(await query);
    },
  });
}

export const ACTIVITY_AREAS = [
  "all",
  "auth",
  "accounts",
  "payments",
  "escrow",
  "moderation",
  "notifications",
  "admin",
  "system",
];
