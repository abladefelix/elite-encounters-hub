/**
 * Server-only admin account editing: create members by hand and edit every
 * field of an existing account (identity, room, vetting, credentials, roles).
 *
 * Reached only through `admin-users.functions.ts`.
 */
import type { Database } from "@/integrations/supabase/types";

import {
  admin,
  checkAvailability,
  isEmailShaped,
  logActivity,
  normalizeCard,
  normalizeUsername,
  notify,
} from "./identity.server";

type Tier = Database["public"]["Enums"]["tier"];
type AppRole = Database["public"]["Enums"]["app_role"];
type VettingStatus = Database["public"]["Enums"]["vetting_status"];
type AccountStatus = Database["public"]["Enums"]["account_status"];

export interface AdminUserFields {
  display_name?: string | undefined;
  username?: string | null | undefined;
  city?: string | undefined;
  address?: string | undefined;
  locality?: string | undefined;
  phone?: string | null | undefined;
  headline?: string | undefined;
  bio?: string | undefined;
  avatar_url?: string | null | undefined;
  hourly_rate?: number | undefined;
  years_experience?: number | undefined;
  response_minutes?: number | undefined;
  languages?: string[] | undefined;
  likes?: string[] | undefined;
  dislikes?: string[] | undefined;
  room?: Tier | null | undefined;
  vetting?: VettingStatus | undefined;
  verified?: boolean | undefined;
  available?: boolean | undefined;
  suspended?: boolean | undefined;
  jobs_completed?: number | undefined;
  ghana_card_number?: string | null | undefined;
  ghana_card_expiry?: string | null | undefined;
  account_status?: AccountStatus | undefined;
  status_reason?: string | undefined;
}

export interface AdminUserAccount {
  email: string;
  emailConfirmed: boolean;
  roles: AppRole[];
  lastSignInAt: string | null;
}

function clean(fields: AdminUserFields) {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    patch[key] = typeof value === "string" && key !== "status_reason" ? value.trim() : value;
  }
  if (typeof patch["username"] === "string") {
    patch["username"] = normalizeUsername(patch["username"] as string) || null;
  }
  if (typeof patch["ghana_card_number"] === "string") {
    patch["ghana_card_number"] = normalizeCard(patch["ghana_card_number"] as string) || null;
  }
  if (patch["ghana_card_expiry"] === "") patch["ghana_card_expiry"] = null;
  return patch as Database["public"]["Tables"]["profiles"]["Update"];
}

async function setRoles(userId: string, roles: AppRole[]) {
  const client = await admin();
  const unique = [...new Set(roles)];
  await client.from("user_roles").delete().eq("user_id", userId);
  if (unique.length) {
    const { error } = await client
      .from("user_roles")
      .insert(unique.map((role) => ({ user_id: userId, role })));
    if (error) throw new Error(error.message);
  }
}

/** Email, confirmation state and roles for one account. */
export async function getAccount(userId: string): Promise<AdminUserAccount> {
  const client = await admin();
  const { data, error } = await client.auth.admin.getUserById(userId);
  if (error) throw new Error(error.message);
  const { data: roleRows } = await client.from("user_roles").select("role").eq("user_id", userId);
  return {
    email: data.user?.email ?? "",
    emailConfirmed: Boolean(data.user?.email_confirmed_at),
    roles: (roleRows ?? []).map((row) => row.role),
    lastSignInAt: data.user?.last_sign_in_at ?? null,
  };
}

export interface CreateUserInput {
  email: string;
  password: string;
  roles: AppRole[];
  fields: AdminUserFields;
  notifyUser?: boolean | undefined;
  actorId: string;
}

/** Hand-create an account. The member can sign in immediately. */
export async function createUser(input: CreateUserInput) {
  const client = await admin();
  const email = input.email.trim().toLowerCase();
  if (!isEmailShaped(email)) throw new Error("That email address doesn't look right.");
  if (input.password.length < 8) throw new Error("Use a password of at least 8 characters.");

  const availability = await checkAvailability({
    email,
    username: input.fields.username ?? undefined,
    phone: input.fields.phone ?? undefined,
    ghanaCard: input.fields.ghana_card_number ?? undefined,
  });
  for (const [key, state] of Object.entries(availability)) {
    if (state === "taken") throw new Error(`That ${key.replace("ghanaCard", "Ghana Card")} is already in use.`);
    if (state === "invalid") throw new Error(`That ${key.replace("ghanaCard", "Ghana Card")} isn't valid.`);
  }

  const { data, error } = await client.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      display_name: input.fields.display_name ?? email.split("@")[0],
      username: input.fields.username ?? "",
      phone: input.fields.phone ?? "",
      city: input.fields.city ?? "",
      address: input.fields.address ?? "",
      locality: input.fields.locality ?? "",
      role: input.roles.includes("specialist") ? "specialist" : "client",
      accepted_terms: "true",
      accepted_privacy: "true",
    },
  });
  if (error || !data.user) throw new Error(error?.message ?? "Could not create that account.");
  const userId = data.user.id;

  const patch = clean({ account_status: "active", ...input.fields });
  if (Object.keys(patch).length) {
    const { error: profileError } = await client.from("profiles").update(patch).eq("id", userId);
    if (profileError) throw new Error(profileError.message);
  }
  await setRoles(userId, input.roles.length ? input.roles : ["client"]);

  if (input.notifyUser !== false) {
    await notify([userId], {
      title: "Your Ashnight account is ready",
      body: "An administrator created this account for you. Sign in with the email and password you were given, then change your password from your profile.",
      kind: "welcome",
      link: "/profile",
      sentBy: input.actorId,
    });
  }

  await logActivity({
    area: "accounts",
    event: "user_created_by_admin",
    actorId: input.actorId,
    target: email,
    details: { userId, roles: input.roles },
  });

  return { userId };
}

export interface UpdateUserInput {
  userId: string;
  fields: AdminUserFields;
  email?: string | undefined;
  password?: string | undefined;
  roles?: AppRole[] | undefined;
  actorId: string;
}

/** Edit any aspect of an existing account. */
export async function updateUser(input: UpdateUserInput) {
  const client = await admin();

  const current = await getAccount(input.userId);
  const nextEmail = input.email?.trim().toLowerCase();

  if (nextEmail && nextEmail !== current.email) {
    if (!isEmailShaped(nextEmail)) throw new Error("That email address doesn't look right.");
    const availability = await checkAvailability({ email: nextEmail });
    if (availability.email === "taken") throw new Error("That email is already in use.");
  }

  if (input.fields.username) {
    const username = normalizeUsername(input.fields.username);
    const { data: clash } = await client
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .neq("id", input.userId)
      .limit(1);
    if ((clash?.length ?? 0) > 0) throw new Error("That username is already taken.");
  }

  const credentials: { email?: string; password?: string; email_confirm?: boolean } = {};
  if (nextEmail && nextEmail !== current.email) {
    credentials.email = nextEmail;
    credentials.email_confirm = true;
  }
  if (input.password) {
    if (input.password.length < 8) throw new Error("Use a password of at least 8 characters.");
    credentials.password = input.password;
  }
  if (Object.keys(credentials).length) {
    const { error } = await client.auth.admin.updateUserById(input.userId, credentials);
    if (error) throw new Error(error.message);
  }

  const patch = clean(input.fields);
  if (Object.keys(patch).length) {
    const { error } = await client.from("profiles").update(patch).eq("id", input.userId);
    if (error) throw new Error(error.message);
  }

  if (input.roles) await setRoles(input.userId, input.roles);

  await logActivity({
    area: "accounts",
    event: "user_edited_by_admin",
    actorId: input.actorId,
    target: input.userId,
    details: {
      fields: Object.keys(patch),
      emailChanged: Boolean(credentials.email),
      passwordChanged: Boolean(credentials.password),
      roles: input.roles ?? current.roles,
    },
  });

  return { ok: true };
}

/** Permanently remove an account and everything the database cascades from it. */
export async function deleteUser(userId: string, actorId: string) {
  const client = await admin();
  const account = await getAccount(userId).catch(() => null);
  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
  await logActivity({
    area: "accounts",
    event: "user_deleted_by_admin",
    severity: "warn",
    actorId,
    target: account?.email ?? userId,
  });
  return { ok: true };
}
