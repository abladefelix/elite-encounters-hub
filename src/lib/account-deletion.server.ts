/**
 * Server-only helper for member-initiated account deletion.
 *
 * Removing the auth user cascades the profile and everything keyed to it, so
 * the member's email, username, phone and Ghana card become free again.
 */
import { admin, logActivity } from "./identity.server";

export async function deleteOwnAccount(userId: string) {
  const client = await admin();

  const { data: profile } = await client
    .from("profiles")
    .select("display_name, username")
    .eq("id", userId)
    .maybeSingle();

  // Best effort: drop the profile row first so listings clear immediately even
  // if the auth delete is retried.
  await client.from("profiles").delete().eq("id", userId);

  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);

  await logActivity({
    area: "accounts",
    event: "account_self_deleted",
    severity: "warn",
    actorId: userId,
    target: profile?.username ?? profile?.display_name ?? userId,
  });

  return { ok: true as const };
}
