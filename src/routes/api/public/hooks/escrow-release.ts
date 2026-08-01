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
 *   header: apikey: <project publishable key>
 */
import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function authorize(request: Request) {
  const expected =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"] ?? "";
  const apikey = request.headers.get("apikey");
  if (expected && apikey && apikey === expected) return true;

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
