/**
 * Public settings reader.
 *
 * Signed-out visitors need the brand, wording, sign-up form, feature flags and
 * room list before they have a session. The settings row also holds admin-only
 * material (integration keys, backup credentials), so the projection happens
 * here on the server and only the whitelisted sections ever leave the box.
 */
import { createServerFn } from "@tanstack/react-start";

/** Sections that are safe for anyone, signed in or not, to read. */
const PUBLIC_SECTIONS = [
  "branding",
  "locale",
  "signup",
  "features",
  "rooms",
  "platform",
] as const;

export type PublicSettings = Record<string, unknown>;

export const getPublicSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicSettings> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("platform_settings")
      .select("data")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const blob = (data?.data ?? {}) as Record<string, unknown>;
    const slice: PublicSettings = {};
    for (const section of PUBLIC_SECTIONS) {
      if (blob[section] !== undefined && blob[section] !== null) slice[section] = blob[section];
    }
    return slice;
  },
);
