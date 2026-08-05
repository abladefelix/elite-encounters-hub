import type { Database } from "@/integrations/supabase/types";

import { admin, logActivity } from "./identity.server";

export interface SessionPolicy {
  maxConcurrentSessions: number;
  idleTimeoutMinutes: number;
  absoluteTimeoutHours: number;
}

export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  maxConcurrentSessions: 1,
  idleTimeoutMinutes: 30,
  absoluteTimeoutHours: 24,
};

function expiresIn(amount: number, unitMs: number) {
  return new Date(Date.now() + amount * unitMs).toISOString();
}

export function tokenSessionId(accessToken: string) {
  try {
    const part = accessToken.split(".")[1];
    if (!part) return null;
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as {
      session_id?: string;
      sub?: string;
    };
    return payload.session_id ?? null;
  } catch {
    return null;
  }
}

export function resolveSessionId(input: {
  userId: string;
  accessToken?: string;
  verifiedSessionId?: string;
  deviceId?: string;
}) {
  if (input.verifiedSessionId) return input.verifiedSessionId;
  const tokenId = tokenSessionId(input.accessToken ?? "");
  if (tokenId) return tokenId;
  const deviceId = input.deviceId?.trim();
  if (!deviceId || deviceId.length < 8 || deviceId.length > 200) return null;
  return `device:${input.userId}:${deviceId}`;
}

export async function sessionPolicy(): Promise<SessionPolicy> {
  const client = await admin();
  const { data } = await client.from("platform_settings").select("data").eq("id", true).maybeSingle();
  const blob = (data?.data ?? {}) as Record<string, unknown>;
  const stored = (blob["security"] ?? {}) as Partial<SessionPolicy>;
  return {
    maxConcurrentSessions: Math.min(10, Math.max(1, Number(stored.maxConcurrentSessions) || 1)),
    idleTimeoutMinutes: Math.min(10080, Math.max(5, Number(stored.idleTimeoutMinutes) || 30)),
    absoluteTimeoutHours: Math.min(720, Math.max(1, Number(stored.absoluteTimeoutHours) || 24)),
  };
}

export async function registerSession(input: {
  userId: string;
  accessToken?: string;
  authSessionId?: string;
  deviceId: string;
  deviceName: string;
  userAgent: string;
  ip: string;
}) {
  const client = await admin();
  const authSessionId = resolveSessionId({
    userId: input.userId,
    ...(input.accessToken ? { accessToken: input.accessToken } : {}),
    ...(input.authSessionId ? { verifiedSessionId: input.authSessionId } : {}),
    deviceId: input.deviceId,
  });
  if (!authSessionId) throw new Error("The authentication session could not be registered.");
  const { data: existing } = await client
    .from("active_sessions")
    .select("id, revoked_at, revoked_reason")
    .eq("auth_session_id", authSessionId)
    .maybeSingle();
  if (existing?.revoked_at) throw new Error(existing.revoked_reason || "This session was ended.");
  const policy = await sessionPolicy();
  if (existing) {
    await client.from("active_sessions").update({ last_seen_at: new Date().toISOString(), idle_expires_at: expiresIn(policy.idleTimeoutMinutes, 60_000) }).eq("id", existing.id);
    return { policy, authSessionId };
  }
  const now = new Date().toISOString();
  await client
    .from("active_sessions")
    .update({ revoked_at: now, revoked_reason: "Session expired" })
    .eq("user_id", input.userId)
    .is("revoked_at", null)
    .or(`idle_expires_at.lte.${now},absolute_expires_at.lte.${now}`);

  const { data: active } = await client
    .from("active_sessions")
    .select("id, auth_session_id")
    .eq("user_id", input.userId)
    .is("revoked_at", null)
    .order("last_seen_at", { ascending: true });

  const overflow = Math.max(0, (active?.length ?? 0) - policy.maxConcurrentSessions + 1);
  const displaced = (active ?? []).slice(0, overflow);
  if (displaced.length) {
    await client
      .from("active_sessions")
      .update({ revoked_at: now, revoked_reason: "Concurrent session limit reached" })
      .in("id", displaced.map((row) => row.id));
  }

  const row: Database["public"]["Tables"]["active_sessions"]["Insert"] = {
    user_id: input.userId,
    auth_session_id: authSessionId,
    device_id: input.deviceId,
    device_name: input.deviceName || "Unknown device",
    user_agent: input.userAgent,
    ip_address: input.ip,
    idle_expires_at: expiresIn(policy.idleTimeoutMinutes, 60_000),
    absolute_expires_at: expiresIn(policy.absoluteTimeoutHours, 3_600_000),
  };
  const { error } = await client.from("active_sessions").insert(row);
  // Registration can race with another protected query during first render.
  // Keep the row that won rather than turning a healthy login into a 500.
  if (error?.code === "23505") {
    const { data: winner } = await client
      .from("active_sessions")
      .select("revoked_at, revoked_reason")
      .eq("auth_session_id", authSessionId)
      .maybeSingle();
    if (winner?.revoked_at) throw new Error(winner.revoked_reason || "This session was ended.");
    if (winner) return { policy, authSessionId };
  }
  if (error) throw new Error(error.message);
  return { policy, authSessionId };
}

export async function validateSession(userId: string, accessToken?: string, verifiedSessionId?: string, deviceId?: string) {
  const client = await admin();
  const authSessionId = resolveSessionId({
    userId,
    ...(accessToken ? { accessToken } : {}),
    ...(verifiedSessionId ? { verifiedSessionId } : {}),
    ...(deviceId ? { deviceId } : {}),
  });
  if (!authSessionId) return { valid: false, reason: "Session identity is missing." };
  const { data } = await client
    .from("active_sessions")
    .select("id, revoked_at, revoked_reason, idle_expires_at, absolute_expires_at")
    .eq("user_id", userId)
    .eq("auth_session_id", authSessionId)
    .maybeSingle();
  if (!data) return { valid: false, reason: "This session is no longer registered." };
  if (data.revoked_at) return { valid: false, reason: data.revoked_reason || "This session was ended." };
  const now = Date.now();
  if (new Date(data.idle_expires_at).getTime() <= now) return { valid: false, reason: "Your session expired due to inactivity." };
  if (new Date(data.absolute_expires_at).getTime() <= now) return { valid: false, reason: "Your session reached its maximum duration." };
  const policy = await sessionPolicy();
  await client.from("active_sessions").update({
    last_seen_at: new Date().toISOString(),
    idle_expires_at: expiresIn(policy.idleTimeoutMinutes, 60_000),
  }).eq("id", data.id);
  return { valid: true, reason: "" };
}

export async function revokeAllSessions(userId: string, reason: string, actorId?: string) {
  const client = await admin();
  await client.from("active_sessions").update({ revoked_at: new Date().toISOString(), revoked_reason: reason }).eq("user_id", userId).is("revoked_at", null);
  await client.auth.admin.signOut(userId, "global");
  await logActivity({ area: "auth", event: "sessions_revoked", severity: "warn", actorId: actorId ?? userId, target: userId, details: { reason } });
  return { ok: true };
}

export async function revokeSession(sessionId: string, actorId: string) {
  const client = await admin();
  const { data } = await client.from("active_sessions").select("user_id").eq("id", sessionId).maybeSingle();
  if (!data) throw new Error("That session no longer exists.");
  await client.from("active_sessions").update({ revoked_at: new Date().toISOString(), revoked_reason: "Ended by an administrator" }).eq("id", sessionId).is("revoked_at", null);
  await logActivity({ area: "auth", event: "session_revoked", severity: "warn", actorId, target: data.user_id, details: { sessionId } });
  return { ok: true };
}

export async function revokeSessions(sessionIds: string[], actorId: string) {
  const client = await admin();
  const uniqueIds = [...new Set(sessionIds)];
  const { data, error } = await client.from("active_sessions").select("id, user_id").in("id", uniqueIds).is("revoked_at", null);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (!rows.length) return { ok: true, count: 0 };
  const ids = rows.map((row) => row.id);
  const { error: updateError } = await client.from("active_sessions").update({ revoked_at: new Date().toISOString(), revoked_reason: "Ended by an administrator" }).in("id", ids);
  if (updateError) throw new Error(updateError.message);
  await logActivity({ area: "auth", event: "sessions_bulk_revoked", severity: "warn", actorId, target: `${rows.length} sessions`, details: { sessionIds: ids, userIds: [...new Set(rows.map((row) => row.user_id))] } });
  return { ok: true, count: rows.length };
}

export async function listSessionsForAdmin() {
  const client = await admin();
  const { data, error } = await client.from("active_sessions").select("*").order("last_seen_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  const ids = [...new Set((data ?? []).map((row) => row.user_id))];
  const { data: profiles } = ids.length ? await client.from("profiles").select("id, display_name, username").in("id", ids) : { data: [] };
  const names = new Map((profiles ?? []).map((row) => [row.id, row]));
  return (data ?? []).map((row) => ({ ...row, profile: names.get(row.user_id) ?? null }));
}