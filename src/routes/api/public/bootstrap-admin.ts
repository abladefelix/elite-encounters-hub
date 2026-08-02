/**
 * One-time control-room bootstrap.
 *
 * Ashnight ships with no admin account. This endpoint creates the first one, but
 * it is not open to the world: the caller must present the platform's job
 * trigger secret, and the password is generated fresh each time rather than
 * baked into the source. Every later call is refused once the account exists.
 */
import { createFileRoute } from "@tanstack/react-router";

const DEFAULT_EMAIL = "admin@ashnight.app";
const DEFAULT_USERNAME = "ashnight.admin";

/** Random, printable, and long enough that guessing is hopeless. */
function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_";
  const bytes = crypto.getRandomValues(new Uint32Array(24));
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join("");
}

async function findByEmail(
  admin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((user) => (user.email ?? "").toLowerCase() === DEFAULT_EMAIL);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

/**
 * Confirms the caller knows the platform job secret. The secret lives in the
 * integration vault and is never shipped to the browser.
 */
async function callerIsTrusted(request: Request) {
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

async function bootstrap(request: Request) {
  if (!(await callerIsTrusted(request))) {
    return Response.json({ created: false, reason: "Not authorised." }, { status: 401 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const existing = await findByEmail(supabaseAdmin);
  if (existing) {
    return Response.json(
      { created: false, reason: "The default admin account already exists." },
      { status: 409 },
    );
  }

  const password = generatePassword();
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: DEFAULT_EMAIL,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Ashnight Admin", username: DEFAULT_USERNAME, role: "client" },
  });
  if (error || !data.user) {
    return Response.json({ created: false, reason: error?.message ?? "unknown" }, { status: 500 });
  }

  const id = data.user.id;
  await supabaseAdmin.from("profiles").upsert(
    {
      id,
      display_name: "Ashnight Admin",
      username: DEFAULT_USERNAME,
      account_status: "active",
      suspended: false,
      city: "Accra",
    },
    { onConflict: "id" },
  );
  await supabaseAdmin.from("user_roles").insert({ user_id: id, role: "admin" });
  await supabaseAdmin.from("activity_log").insert({
    actor_id: id,
    actor_label: DEFAULT_EMAIL,
    area: "accounts",
    event: "default_admin_created",
    severity: "warn",
    target: DEFAULT_EMAIL,
    ip: "",
    user_agent: "",
    details: {} as never,
  });

  return Response.json({
    created: true,
    email: DEFAULT_EMAIL,
    username: DEFAULT_USERNAME,
    password,
    note: "This password is shown once. Sign in at / then change it from the control room immediately.",
  });
}

export const Route = createFileRoute("/api/public/bootstrap-admin")({
  server: {
    handlers: {
      POST: ({ request }) => bootstrap(request),
    },
  },
});
