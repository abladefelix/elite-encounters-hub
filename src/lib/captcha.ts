/**
 * CAPTCHA configuration for the browser.
 *
 * Only the Turnstile *site* key ever reaches a member's device — the secret
 * lives in the admin key vault and is read on the server. The challenge is
 * considered active when a site key exists and the Security feature flag is on.
 */
import { useFeatureFlags } from "@/lib/feature-flags";
import { usePublicIntegrations } from "@/lib/integration-keys";

export function useCaptcha() {
  const { flags } = useFeatureFlags();
  const integrations = usePublicIntegrations();
  const siteKey = (integrations.value.turnstile_site_key ?? "").trim();

  return {
    /** Should the form show a challenge and require a token? */
    enabled: Boolean(siteKey) && flags.captchaOnAuth,
    siteKey,
  };
}
