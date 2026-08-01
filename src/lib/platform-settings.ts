/**
 * Admin-owned platform configuration.
 *
 * Stored in a single database row so a change made by an admin applies to
 * every member on every device — not just the browser that made it.
 * Each feature area owns one key inside the row.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type SettingsSection =
  | "rooms"
  | "escrow"
  | "gifts"
  | "moderation"
  | "platform"
  | "features"
  | "integrations"
  | "security";

type SettingsBlob = Partial<Record<SettingsSection, unknown>>;

const QUERY_KEY = ["platform-settings"];

async function readSettings(): Promise<SettingsBlob> {
  const { data, error } = await supabase
    .from("platform_settings")
    .select("data")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.data as SettingsBlob | null) ?? {};
}

/**
 * Reads one settings section, falling back to the supplied defaults for any
 * key the admin has never touched.
 */
export function useSettingsSection<T extends object>(section: SettingsSection, fallback: T) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: readSettings,
    staleTime: 30_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("platform-settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "platform_settings" },
        () => {
          void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const stored = (query.data?.[section] as Partial<T> | undefined) ?? undefined;
  const value = { ...fallback, ...(stored ?? {}) } as T;

  const save = useCallback(
    async (next: T) => {
      const current = await readSettings();
      const merged = { ...current, [section]: next } as unknown as Json;
      const { error } = await supabase
        .from("platform_settings")
        .update({ data: merged })
        .eq("id", true);
      if (error) throw new Error(error.message);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    [section, queryClient],
  );

  return { value, save, loading: query.isLoading, ready: !query.isLoading };
}
