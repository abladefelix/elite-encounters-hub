/**
 * Specialist portfolio media (server-only).
 *
 * Portfolio photos and the intro clip live in the private `attachments`
 * bucket, and the paths themselves sit in `profiles.extra` — a column ordinary
 * members are not granted. So every read and write goes through here, using the
 * admin client after the caller has been checked.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface PortfolioMedia {
  /** Signed (or already public) links, ready for <img>/<video>. */
  avatarUrl: string | null;
  photos: { path: string; url: string }[];
  video: { path: string; url: string } | null;
}

const ONE_HOUR = 60 * 60;

function pathsOf(extra: unknown) {
  const bag = (extra ?? {}) as Record<string, unknown>;
  const rawPhotos = bag["portfolio_photos"];
  const rawVideo = bag["portfolio_video"];
  return {
    photoPaths: Array.isArray(rawPhotos)
      ? rawPhotos.filter((item): item is string => typeof item === "string" && item.length > 0)
      : [],
    videoPath: typeof rawVideo === "string" && rawVideo ? rawVideo : null,
  };
}

/** Signs a stored reference; demo rows may already hold a URL or site path. */
async function sign(bucket: "avatars" | "attachments", value: string) {
  if (/^https?:\/\//i.test(value) || value.startsWith("/")) return value;
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(value, ONE_HOUR);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Reads one member's portfolio, signing everything it can. */
export async function readPortfolio(userId: string): Promise<PortfolioMedia> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("avatar_url, extra")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { avatarUrl: null, photos: [], video: null };

  const { photoPaths, videoPath } = pathsOf(data.extra);
  const avatarUrl = data.avatar_url ? await sign("avatars", data.avatar_url) : null;
  const photos: { path: string; url: string }[] = [];
  for (const path of photoPaths) {
    const url = await sign("attachments", path);
    if (url) photos.push({ path, url });
  }
  const videoUrl = videoPath ? await sign("attachments", videoPath) : null;

  return {
    avatarUrl,
    photos,
    video: videoPath && videoUrl ? { path: videoPath, url: videoUrl } : null,
  };
}

/**
 * Confirms the target is a listed, approved, placed specialist — the same
 * gate the directory uses — so members can't fish media out of other accounts.
 */
export async function assertListedSpecialist(specialistId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, vetting, suspended, room")
    .eq("id", specialistId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.vetting !== "approved" || data.suspended || !data.room) {
    throw new Error("That specialist profile isn't available.");
  }
  const { data: role } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", specialistId)
    .eq("role", "specialist")
    .maybeSingle();
  if (!role) throw new Error("That specialist profile isn't available.");
}

/** Saves the caller's own portfolio paths, rejecting anything outside their folder. */
export async function writePortfolio(
  userId: string,
  photoPaths: string[],
  videoPath: string | null,
) {
  const owned = (path: string) => path.startsWith(`${userId}/`);
  if (photoPaths.some((path) => !owned(path)) || (videoPath && !owned(videoPath))) {
    throw new Error("Those files don't belong to your account.");
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("extra")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const extra = { ...((data?.extra ?? {}) as Record<string, unknown>) };
  extra["portfolio_photos"] = photoPaths;
  extra["portfolio_video"] = videoPath;

  const { error: saveError } = await supabaseAdmin
    .from("profiles")
    .update({ extra })
    .eq("id", userId);
  if (saveError) throw new Error(saveError.message);
}
