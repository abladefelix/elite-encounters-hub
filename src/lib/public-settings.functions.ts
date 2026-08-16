/**
 * Public settings reader.
 *
 * Signed-out visitors need the brand, wording, sign-up form, feature flags and
 * room list before they have a session. The settings row also holds admin-only
 * material (integration keys, backup credentials), so the projection happens
 * here on the server and only the whitelisted sections ever leave the box.
 */
import { createServerFn } from "@tanstack/react-start";

import type { Json } from "@/integrations/supabase/types";

/** Sections that are safe for anyone, signed in or not, to read. */
const PUBLIC_SECTIONS = [
  "branding",
  "locale",
  "signup",
  "forms",
  "features",
  "rooms",
  "platform",
  "appearance",
  // Non-secret third-party values only (Paystack public key, LiveKit URL,
  // Turnstile site key) — the projection above never includes vault secrets.
  "integrations",
] as const;

export type PublicSettings = Record<string, Json>;

export const getPublicSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicSettings> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("platform_settings")
      .select("data")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const blob = (data?.data ?? {}) as Record<string, Json>;
    const slice: PublicSettings = {};
    for (const section of PUBLIC_SECTIONS) {
      const value = blob[section];
      if (value !== undefined && value !== null) slice[section] = value;
    }
    return slice;
  },
);
