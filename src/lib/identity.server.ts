/**
 * Server-only identity, account-state and investigation helpers.
 *
 * Uniqueness, username sign-in, account bans and the activity log all need
 * privileges a browser must never hold, so every function here runs with the
 * service-role client and is reached only through `identity.functions.ts`.
 */
import type { Database } from "@/integrations/supabase/types";

type AccountStatus = Database["public"]["Enums"]["account_status"];

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/* ------------------------------------------------------------ normalisation */

export const normalizeUsername = (value: string) => value.trim().toLowerCase();
export const normalizePhone = (value: string) => value.replace(/[^0-9]/g, "");
export const normalizeCard = (value: string) => value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/** Deliberately strict: one @, a dotted domain, no spaces, sane length. */
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

export function isEmailShaped(value: string) {
  return EMAIL_RE.test(value.trim()) && value.trim().length <= 254;
}

/* --------------------------------------------------------------- activity log */

export interface ActivityInput {
  actorId?: string | null | undefined;
  actorLabel?: string | undefined;
  area?: string | undefined;
  event: string;
  severity?: "info" | "warn" | "error" | undefined;
  target?: string | undefined;
  ip?: string | undefined;
  userAgent?: string | undefined;
  details?: Record<string, unknown> | undefined;
}

/** Never throws: an investigation trail must not break the action it records. */
export async function logActivity(input: ActivityInput) {
  try {
    const client = await admin();
    await client.from("activity_log").insert({
      actor_id: input.actorId ?? null,
      actor_label: input.actorLabel ?? "",
      area: input.area ?? "system",
      event: input.event,
      severity: input.severity ?? "info",
      target: input.target ?? "",
      ip: input.ip ?? "",
      user_agent: input.userAgent ?? "",
      details: (input.details ?? {}) as never,
    });
  } catch (error) {
    console.error("activity log write failed", error);
  }
}

/* ------------------------------------------------------------- notifications */

export async function notify(
  userIds: string[],
  payload: {
    title: string;
    body?: string | undefined;
    kind?: string | undefined;
    link?: string | undefined;
    sentBy?: string | null | undefined;
  },
) {
  if (!userIds.length) return 0;
  const client = await admin();
  const broadcastId = crypto.randomUUID();
  const rows = userIds.map((userId) => ({
    user_id: userId,
    title: payload.title,
    body: payload.body ?? "",
    kind: payload.kind ?? "system",
    link: payload.link ?? "",
    broadcast_id: broadcastId,
    sent_by: payload.sentBy ?? null,
  }));
  const { error } = await client.from("notifications").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

/* ----------------------------------------------------------- availability */

export interface AvailabilityInput {
  username?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  ghanaCard?: string | undefined;
}

export interface AvailabilityResult {
  username: "free" | "taken" | "invalid" | "skipped";
  email: "free" | "taken" | "invalid" | "skipped";
  phone: "free" | "taken" | "invalid" | "skipped";
  ghanaCard: "free" | "taken" | "invalid" | "skipped";
}

/**
 * Answers "can I use this?" with booleans only — never with someone else's
 * details — so the sign-up form can fail fast instead of surfacing a raw
 * database constraint error.
 */
export async function checkAvailability(input: AvailabilityInput): Promise<AvailabilityResult> {
  const client = await admin();
  const result: AvailabilityResult = {
    username: "skipped",
    email: "skipped",
    phone: "skipped",
    ghanaCard: "skipped",
  };

  const username = normalizeUsername(input.username ?? "");
  if (username) {
    if (!/^[a-z0-9_.]{3,32}$/.test(username)) {
      result.username = "invalid";
    } else {
      const { data } = await client
        .from("profiles")
        .select("id")
        .ilike("username", username)
        .limit(1);
      result.username = (data?.length ?? 0) > 0 ? "taken" : "free";
    }
  }

  const email = (input.email ?? "").trim().toLowerCase();
  if (email) {
    if (!isEmailShaped(email)) {
      result.email = "invalid";
    } else {
      result.email = (await emailInUse(email)) ? "taken" : "free";
    }
  }

  const phone = normalizePhone(input.phone ?? "");
  if (phone) {
    if (phone.length < 9) {
      result.phone = "invalid";
    } else {
      const { data } = await client.from("profiles").select("id, phone").not("phone", "is", null);
      const hit = (data ?? []).some((row) => normalizePhone(row.phone ?? "") === phone);
      result.phone = hit ? "taken" : "free";
    }
  }

  const card = normalizeCard(input.ghanaCard ?? "");
  if (card) {
    if (!/^GHA[0-9]{9,12}$/.test(card)) {
      result.ghanaCard = "invalid";
    } else {
      const { data } = await client
        .from("profiles")
        .select("id, ghana_card_number")
        .not("ghana_card_number", "is", null);
      const hit = (data ?? []).some(
        (row) => normalizeCard(row.ghana_card_number ?? "") === card,
      );
      result.ghanaCard = hit ? "taken" : "free";
    }
  }

  return result;
}

/** Does any auth user already hold this email? Confirmed or not. */
async function emailInUse(email: string) {
  const client = await admin();
  const user = await findAuthUserByEmail(email);
  if (!user) return false;
  // An account that never confirmed its email frees its details for reuse.
  if (!user.email_confirmed_at) {
    await releaseUser(user.id, "email reclaimed by a new sign-up");
    await client.from("profiles").delete().eq("id", user.id);
    return false;
  }
  return true;
}

interface MinimalAuthUser {
  id: string;
  email?: string | undefined;
  email_confirmed_at?: string | null | undefined;
  created_at?: string | undefined;
}

async function findAuthUserByEmail(email: string): Promise<MinimalAuthUser | null> {
  const client = await admin();
  // Auth admin search is paginated; the needle is an exact address.
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((user) => (user.email ?? "").toLowerCase() === email);
    if (hit) return hit as MinimalAuthUser;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** Removes an auth user so their email, username and phone become free again. */
async function releaseUser(userId: string, reason: string) {
  const client = await admin();
  await client.auth.admin.deleteUser(userId);
  await logActivity({
    area: "accounts",
    event: "abandoned_signup_released",
    target: userId,
    details: { reason },
  });
}

/**
 * Frees the details of sign-ups that were never confirmed, so a real member can
 * claim that username, email, phone or Ghana card number.
 */
export async function releaseAbandonedSignups(hours: number) {
  const client = await admin();
  const cutoff = Date.now() - Math.max(1, hours) * 3600_000;
  let released = 0;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    for (const user of data.users) {
      if (user.email_confirmed_at) continue;
      if (user.last_sign_in_at) continue;
      const created = user.created_at ? new Date(user.created_at).getTime() : Date.now();
      if (created > cutoff) continue;
      await client.from("profiles").delete().eq("id", user.id);
      await client.auth.admin.deleteUser(user.id);
      released += 1;
    }
    if (data.users.length < 200) break;
  }

  if (released) {
    await logActivity({
      area: "accounts",
      event: "abandoned_signups_released",
      details: { released, olderThanHours: hours },
    });
  }
  return { released };
}

/* --------------------------------------------------------- username sign-in */

export interface SignInResult {
  accessToken: string;
  refreshToken: string;
}

/**
 * Signs a member in with either their email or their username.
 *
 * The username → email lookup happens here, behind a correct password, so the
 * browser can never enumerate member email addresses.
 */
export async function signInWithIdentifier(
  identifier: string,
  password: string,
  meta: { ip?: string | undefined; userAgent?: string | undefined },
): Promise<SignInResult> {
  const client = await admin();
  const raw = identifier.trim();
  let email = raw.toLowerCase();

  if (!raw.includes("@")) {
    const { data, error } = await client
      .from("profiles")
      .select("id")
      .ilike("username", normalizeUsername(raw))
      .maybeSingle();
    if (error) throw new Error("We couldn't check that username. Try again.");
    if (!data) throw new Error("No Ashnight account uses that username.");
    const { data: userData, error: userError } = await client.auth.admin.getUserById(data.id);
    if (userError || !userData.user?.email) {
      throw new Error("That account can't sign in with a username. Use your email address.");
    }
    email = userData.user.email.toLowerCase();
  } else if (!isEmailShaped(email)) {
    throw new Error("That doesn't look like a valid email address.");
  }

  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const auth = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });

  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    await logActivity({
      area: "auth",
      event: "sign_in_failed",
      severity: "warn",
      target: raw,
      ip: meta.ip ?? "",
      userAgent: meta.userAgent ?? "",
      details: { reason: error?.message ?? "no session" },
    });
    throw new Error(
      error?.message?.toLowerCase().includes("invalid")
        ? "Those details don't match an Ashnight account."
        : (error?.message ?? "Sign-in failed. Try again."),
    );
  }

  const status = await accountStatusOf(data.session.user.id);
  if (status && status.blocked) {
    await auth.auth.signOut();
    await logActivity({
      area: "auth",
      event: "sign_in_blocked",
      severity: "warn",
      actorId: data.session.user.id,
      target: status.status,
      ip: meta.ip ?? "",
      details: { reason: status.reason },
    });
    throw new Error(status.message);
  }

  await logActivity({
    area: "auth",
    event: "sign_in",
    actorId: data.session.user.id,
    actorLabel: raw,
    ip: meta.ip ?? "",
    userAgent: meta.userAgent ?? "",
  });

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}

const BLOCKED_MESSAGE: Record<string, string> = {
  suspended: "This account is suspended. Contact Ashnight support to appeal.",
  banned: "This account has been permanently closed by Ashnight.",
  deactivated: "This account is deactivated. Contact Ashnight support to reactivate it.",
};

export async function accountStatusOf(userId: string) {
  const client = await admin();
  const { data } = await client
    .from("profiles")
    .select("account_status, status_reason, suspended")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  const status = (data.suspended ? "suspended" : data.account_status) as AccountStatus;
  const blocked = status === "suspended" || status === "banned" || status === "deactivated";
  return {
    status,
    reason: data.status_reason ?? "",
    blocked,
    message: BLOCKED_MESSAGE[status] ?? "This account cannot sign in right now.",
  };
}

/* ------------------------------------------------------------ account state */

const STATUS_NOTE: Record<AccountStatus, { title: string; body: string }> = {
  active: {
    title: "Your Ashnight account is active",
    body: "Welcome back — you have full access to your room again.",
  },
  pending: {
    title: "Your Ashnight account is under review",
    body: "We'll let you know as soon as vetting is complete.",
  },
  deactivated: {
    title: "Your Ashnight account was deactivated",
    body: "Sign-in is paused. Contact support if you'd like it reopened.",
  },
  suspended: {
    title: "Your Ashnight account is suspended",
    body: "Access is paused while we review activity on your account.",
  },
  banned: {
    title: "Your Ashnight account has been closed",
    body: "This decision is permanent. Reach out to support if you believe it's a mistake.",
  },
};

/** Admin-driven state change: ban, suspend, deactivate, reactivate. */
export async function setAccountStatus(input: {
  userId: string;
  status: AccountStatus;
  reason: string;
  actorId: string;
  actorLabel: string;
}) {
  const client = await admin();
  const { error } = await client
    .from("profiles")
    .update({
      account_status: input.status,
      status_reason: input.reason,
      status_changed_at: new Date().toISOString(),
      suspended: input.status === "suspended" || input.status === "banned",
      available: input.status === "active",
    })
    .eq("id", input.userId);
  if (error) throw new Error(error.message);

  // A blocked member's live sessions must die immediately, not at token expiry.
  if (input.status !== "active" && input.status !== "pending") {
    try {
      await client.auth.admin.signOut(input.userId, "global");
    } catch {
      /* the session may already be gone */
    }
  }

  const note = STATUS_NOTE[input.status];
  await notify([input.userId], {
    title: note.title,
    body: input.reason ? `${note.body} Reason: ${input.reason}` : note.body,
    kind: "account",
    sentBy: input.actorId,
  });

  await logActivity({
    area: "accounts",
    event: `account_${input.status}`,
    severity: input.status === "active" || input.status === "pending" ? "info" : "warn",
    actorId: input.actorId,
    actorLabel: input.actorLabel,
    target: input.userId,
    details: { reason: input.reason },
  });

  await client.from("admin_audit_log").insert({
    actor_id: input.actorId,
    area: "accounts",
    action: `set status ${input.status}`,
    target: input.userId,
    note: input.reason,
  });

  return { ok: true };
}

/** Is the caller an admin? Checked against user_roles, never against a claim. */
export async function assertAdmin(userId: string) {
  const client = await admin();
  const { data } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin");
  if (!data?.length) throw new Error("Admin access is required for that.");
}
