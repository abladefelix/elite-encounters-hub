/**
 * Admin-owned platform configuration.
 *
 * Stored in a single database row so a change made by an admin applies to
 * every member on every device — not just the browser that made it.
 * Each feature area owns one key inside the row.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId, useMemo } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { getPublicSettings } from "./public-settings.functions";

export type SettingsSection =
  | "rooms"
  | "escrow"
  | "gifts"
  | "moderation"
  | "platform"
  | "features"
  | "integrations"
  | "security"
  | "signup"
  | "backups"
  | "email"
  | "addons"
  | "documents"
  | "dns"
  | "deployment"
  | "branding"
  | "locale"
  | "welcome"
  | "finance"
  | "emoji"
  | "calls"
  | "appearance";

type SettingsBlob = Partial<Record<SettingsSection, unknown>>;

const QUERY_KEY = ["platform-settings"];

async function readSettings(): Promise<SettingsBlob> {
  const { data, error } = await supabase
    .from("platform_settings")
    .select("data")
    .eq("id", true)
    .maybeSingle();
  if (!error && data) return (data.data as SettingsBlob | null) ?? {};

  // Signed-out visitors cannot read the settings row, so a server function
  // hands back only the public slice (brand, wording, sign-up form, flags).
  return (await getPublicSettings()) as SettingsBlob;
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

  // Every hook instance gets its own realtime topic — Supabase refuses to add
  // a second postgres_changes listener to an already-subscribed channel.
  const channelId = useId();
  useEffect(() => {
    const channel = supabase
      .channel(`platform-settings:${channelId}`)
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
  }, [queryClient, channelId]);

  const stored = query.data?.[section] as Partial<T> | undefined;
  // Memoised on the stored slice: consumers put `value` in effect dependency
  // arrays, and a fresh object every render would spin them forever.
  const value = useMemo(
    () => ({ ...fallback, ...(stored ?? {}) }) as T,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stored],
  );

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
