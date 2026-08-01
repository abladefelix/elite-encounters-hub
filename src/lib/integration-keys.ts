/**
 * Admin-editable key vault.
 *
 * Every third-party credential Ashnight uses lives in `integration_keys` so it
 * can be rotated from the control room without a code change. The table is
 * admin-only at the database level, so secret values never reach a member's
 * browser.
 *
 * Non-secret values (publishable keys, server URLs) are additionally mirrored
 * into the public settings row, which is what the client app reads at runtime.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useSettingsSection } from "@/lib/platform-settings";

export interface IntegrationKeyRow {
  id: string;
  key: string;
  label: string;
  description: string;
  value: string;
  is_secret: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Keys Ashnight expects to exist — shown even before anyone fills them in. */
export const EXPECTED_KEYS: { key: string; label: string; description: string; secret: boolean }[] =
  [
    {
      key: "paystack_public_key",
      label: "Paystack public key",
      description: "Opens the Paystack checkout in the member's browser.",
      secret: false,
    },
    {
      key: "paystack_secret_key",
      label: "Paystack secret key",
      description: "Verifies charges and triggers specialist payouts.",
      secret: true,
    },
    {
      key: "paystack_webhook_secret",
      label: "Paystack webhook secret",
      description: "Shared secret Paystack signs webhook calls with.",
      secret: true,
    },
    {
      key: "livekit_url",
      label: "LiveKit server URL",
      description: "wss:// media server that carries voice and video calls.",
      secret: false,
    },
    {
      key: "livekit_api_key",
      label: "LiveKit API key",
      description: "Used to mint call tokens.",
      secret: true,
    },
    {
      key: "livekit_api_secret",
      label: "LiveKit API secret",
      description: "Used to sign call tokens.",
      secret: true,
    },
  ];

/** Public values the member-facing app is allowed to read. */
export interface PublicIntegrationConfig {
  paystack_public_key: string;
  livekit_url: string;
}

export const DEFAULT_PUBLIC_INTEGRATIONS: PublicIntegrationConfig = {
  paystack_public_key: "",
  livekit_url: "",
};

const QUERY_KEY = ["integration-keys"];

export function usePublicIntegrations() {
  return useSettingsSection<PublicIntegrationConfig>("integrations", DEFAULT_PUBLIC_INTEGRATIONS);
}

/** Admin-only read of the full vault. */
export function useIntegrationKeys() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_keys")
        .select("*")
        .order("is_secret", { ascending: true })
        .order("key", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as IntegrationKeyRow[];
    },
  });
}

export function useIntegrationKeyMutations() {
  const queryClient = useQueryClient();
  const publicConfig = usePublicIntegrations();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const upsert = useMutation({
    mutationFn: async (input: {
      key: string;
      value: string;
      label?: string;
      description?: string;
      is_secret?: boolean;
    }) => {
      const { data: session } = await supabase.auth.getUser();
      const row = {
        key: input.key,
        value: input.value,
        label: input.label ?? input.key,
        description: input.description ?? "",
        is_secret: input.is_secret ?? true,
        updated_by: session.user?.id ?? null,
      };
      const { error } = await supabase.from("integration_keys").upsert(row, { onConflict: "key" });
      if (error) throw new Error(error.message);

      // Mirror non-secret values so member-facing code can read them.
      if (!row.is_secret && (row.key === "paystack_public_key" || row.key === "livekit_url")) {
        await publicConfig.save({ ...publicConfig.value, [row.key]: input.value });
      }
      return row;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("integration_keys").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  return { upsert, remove };
}

/** Shows just enough of a stored secret for an admin to recognise it. */
export function maskValue(value: string) {
  if (!value) return "";
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 4)}${"•".repeat(Math.min(18, value.length - 8))}${value.slice(-4)}`;
}
