/**
 * One-time control-room bootstrap.
 *
 * Ashnight ships with no admin account. The first call to this endpoint creates
 * the default admin below; every later call is refused, so the window closes as
 * soon as the account exists. Change the password from Control room → Email &
 * domain → Admin account straight after the first sign-in.
 */
import { createFileRoute } from "@tanstack/react-router";

const DEFAULT_EMAIL = "admin@ashnight.app";
const DEFAULT_USERNAME = "ashnight.admin";
const DEFAULT_PASSWORD = "AshnightControl2026!";

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

async function bootstrap() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const existing = await findByEmail(supabaseAdmin);
  if (existing) {
    return Response.json(
      { created: false, reason: "The default admin account already exists." },
      { status: 409 },
    );
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: DEFAULT_EMAIL,
    password: DEFAULT_PASSWORD,
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
    note: "Sign in at / then open /ashnight-control and change this password immediately.",
  });
}

export const Route = createFileRoute("/api/public/bootstrap-admin")({
  server: {
    handlers: {
      POST: () => bootstrap(),
    },
  },
});
