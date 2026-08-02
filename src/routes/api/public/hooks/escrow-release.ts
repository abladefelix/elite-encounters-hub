/**
 * Escrow settlement pass.
 *
 * Starts the clearing countdown for holds the member never confirmed, then
 * deposits anything whose hold window elapsed with no issue raised. Runs on a
 * schedule (pg_cron or any external scheduler) and can also be triggered by an
 * admin from the control room.
 *
 * Schedule:
 *   POST https://<your-domain>/api/public/hooks/escrow-release
 *   header: x-ashnight-job-secret: <job trigger secret from the integration vault>
 */
import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Confirms the scheduler knows the platform job secret. The publishable key is
 * public knowledge and is deliberately not accepted here.
 */
async function schedulerIsTrusted(request: Request) {
  const presented = request.headers.get("x-ashnight-job-secret") ?? "";
  if (!presented) return false;

  const envSecret = process.env["ASHNIGHT_JOB_SECRET"] ?? "";
  if (envSecret && presented === envSecret) return true;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("integration_keys")
    .select("value")
    .eq("key", "job_trigger_secret")
    .maybeSingle();
  const stored = (data?.value ?? "").trim();
  return stored.length > 0 && presented === stored;
}

/** Either the scheduler's job secret, or a bearer token belonging to an admin. */
async function authorize(request: Request) {
  if (await schedulerIsTrusted(request)) return true;

  const bearer = request.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!bearer) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(bearer);
  if (error || !data.user) return false;
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("role", "admin");
  return (roles?.length ?? 0) > 0;
}

async function run(request: Request) {
  if (!(await authorize(request))) return json({ error: "Unauthorized" }, 401);
  try {
    const { settleDueEscrow } = await import("@/lib/payments.server");
    const result = await settleDueEscrow();
    return json({ ok: true, ...result });
  } catch (error) {
    console.error("escrow settlement failed", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Failed" }, 500);
  }
}

export const Route = createFileRoute("/api/public/hooks/escrow-release")({
  server: {
    handlers: {
      POST: ({ request }) => run(request),
      GET: ({ request }) => run(request),
    },
  },
});
