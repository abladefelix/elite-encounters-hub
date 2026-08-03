/**
 * Server-side CAPTCHA verification (Cloudflare Turnstile).
 *
 * Abuse protection on sign-in and sign-up: the browser solves a Turnstile
 * challenge and the resulting token is verified here, against the secret key
 * stored in the admin key vault. The secret never leaves the server, and a
 * token is only ever accepted once by Cloudflare.
 *
 * The check is a no-op until an admin saves both Turnstile keys, so a fresh
 * install is never locked out of its own sign-in page.
 */
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** The Turnstile secret key, or "" when the admin has not configured one. */
async function secretKey(): Promise<string> {
  try {
    const client = await admin();
    const { data } = await client
      .from("integration_keys")
      .select("value")
      .eq("key", "turnstile_secret_key")
      .maybeSingle();
    return (data?.value ?? "").trim();
  } catch {
    return "";
  }
}

/** Has an admin switched the auth challenge off in Control room → Features? */
async function challengeEnabled(): Promise<boolean> {
  try {
    const client = await admin();
    const { data } = await client
      .from("platform_settings")
      .select("data")
      .eq("id", true)
      .maybeSingle();
    const blob = (data?.data ?? {}) as Record<string, unknown>;
    const features = (blob["features"] ?? {}) as { captchaOnAuth?: boolean };
    return features.captchaOnAuth !== false;
  } catch {
    return true;
  }
}

export interface CaptchaContext {
  ip?: string | undefined;
  action?: string | undefined;
}

/**
 * Throws a member-readable error unless the supplied token is a genuine,
 * unused Turnstile solution. Silently passes when CAPTCHA is not configured
 * or the admin has turned the challenge off.
 */
export async function assertHuman(
  token: string | undefined,
  context: CaptchaContext = {},
): Promise<void> {
  const secret = await secretKey();
  if (!secret) return;
  if (!(await challengeEnabled())) return;

  const value = (token ?? "").trim();
  if (!value) {
    throw new Error("Complete the security check and try again.");
  }

  const body = new URLSearchParams({ secret, response: value });
  if (context.ip) body.set("remoteip", context.ip);

  let outcome: { success?: boolean; "error-codes"?: string[] };
  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    outcome = (await response.json()) as typeof outcome;
  } catch (error) {
    console.error("turnstile verification unreachable", error);
    throw new Error("We couldn't complete the security check. Try again in a moment.");
  }

  if (outcome.success) return;

  const codes = outcome["error-codes"] ?? [];
  console.warn("turnstile rejected a token", { action: context.action, codes });

  const { logActivity } = await import("./identity.server");
  await logActivity({
    area: "auth",
    event: "captcha_failed",
    severity: "warn",
    target: context.action ?? "auth",
    ip: context.ip ?? "",
    details: { codes },
  });

  throw new Error(
    codes.includes("timeout-or-duplicate")
      ? "That security check expired. Solve it once more and try again."
      : "The security check failed. Refresh the page and try again.",
  );
}
