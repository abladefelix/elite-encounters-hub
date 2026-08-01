/**
 * Admin audit trail. Every control-room change can be recorded here so future
 * admins can see who changed what, and when.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export interface AuditRow {
  id: string;
  actor_id: string | null;
  area: string;
  action: string;
  target: string;
  note: string;
  details: unknown;
  created_at: string;
}

const QUERY_KEY = ["admin-audit-log"];

export function useAuditLog(limit = 100) {
  return useQuery({
    queryKey: [...QUERY_KEY, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as AuditRow[];
    },
  });
}

export function useRecordAudit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      area: string;
      action: string;
      target?: string;
      note?: string;
      details?: Record<string, unknown>;
    }) => {
      const { data: session } = await supabase.auth.getUser();
      const actorId = session.user?.id;
      if (!actorId) return;
      const { error } = await supabase.from("admin_audit_log").insert({
        actor_id: actorId,
        area: input.area,
        action: input.action,
        target: input.target ?? "",
        note: input.note ?? "",
        details: (input.details ?? {}) as never,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
