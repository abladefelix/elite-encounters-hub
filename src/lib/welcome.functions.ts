/**
 * Sends the admin-authored welcome message to the member who just signed up.
 *
 * Runs behind auth so a caller can only ever write a notification for their own
 * account; the copy itself is read from the shared platform settings row.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendWelcomeMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { DEFAULT_WELCOME_SETTINGS, renderWelcomeCopy } = await import("./welcome-message");
    const { DEFAULT_BRANDING } = await import("./branding");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const userId = context.userId;

    const [{ data: settingsRow }, { data: profile }, { data: roles }, { data: existing }] =
      await Promise.all([
        supabaseAdmin.from("platform_settings").select("data").eq("id", true).maybeSingle(),
        supabaseAdmin.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
        supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
        supabaseAdmin
          .from("notifications")
          .select("id")
          .eq("user_id", userId)
          .eq("kind", "welcome")
          .limit(1),
      ]);

    if (existing && existing.length > 0) return { sent: false, reason: "already_sent" as const };

    const blob = (settingsRow?.data ?? {}) as Record<string, unknown>;
    const welcome = {
      ...DEFAULT_WELCOME_SETTINGS,
      ...((blob["welcome"] as Record<string, unknown> | undefined) ?? {}),
    } as typeof DEFAULT_WELCOME_SETTINGS;
    if (!welcome.enabled) return { sent: false, reason: "disabled" as const };

    const branding = {
      ...DEFAULT_BRANDING,
      ...((blob["branding"] as Record<string, unknown> | undefined) ?? {}),
    };

    const isSpecialist = (roles ?? []).some((row) => row.role === "specialist");
    const copy = isSpecialist
      ? { ...DEFAULT_WELCOME_SETTINGS.specialist, ...(welcome.specialist ?? {}) }
      : { ...DEFAULT_WELCOME_SETTINGS.client, ...(welcome.client ?? {}) };

    const values = { name: profile?.display_name ?? "there", brand: branding.name };

    const { error } = await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      title: renderWelcomeCopy(copy.title, values),
      body: renderWelcomeCopy(copy.body, values),
      kind: "welcome",
      link: copy.link || "/",
    });
    if (error) throw new Error(error.message);

    return { sent: true as const };
  });
