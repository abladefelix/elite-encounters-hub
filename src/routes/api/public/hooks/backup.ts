/**
 * Nightly backup endpoint.
 *
 * Dumps every public table (plus, optionally, the storage object index) into a
 * single JSON snapshot and uploads it to the Dropbox and/or Google Drive
 * account the admin configured in the control room. Old snapshots beyond the
 * retention count are pruned in each destination.
 *
 * Callers: pg_cron (or any scheduler) with the project publishable key in an
 * `apikey` header, or a signed-in admin pressing "Run backup now".
 */
import { createFileRoute } from "@tanstack/react-router";

const TABLES = [
  "profiles",
  "user_roles",
  "applications",
  "services",
  "specialist_services",
  "threads",
  "messages",
  "bookings",
  "escrow_entries",
  "memberships",
  "ratings",
  "reports",
  "moderation_hits",
  "platform_settings",
  "integration_keys",
  "admin_audit_log",
] as const;

interface DestinationResult {
  provider: string;
  ok: boolean;
  detail: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function getAdminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Either a valid project apikey header, or a bearer token belonging to an admin. */
async function authorize(request: Request) {
  const expected =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"] ?? "";
  const apikey = request.headers.get("apikey");
  if (expected && apikey && apikey === expected) return true;

  const bearer = request.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!bearer) return false;
  const admin = await getAdminClient();
  const { data, error } = await admin.auth.getUser(bearer);
  if (error || !data.user) return false;
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("role", "admin");
  return (roles?.length ?? 0) > 0;
}

async function dropboxAccessToken(keys: Record<string, string>) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: keys["dropbox_refresh_token"] ?? "",
  });
  const basic = btoa(`${keys["dropbox_app_key"] ?? ""}:${keys["dropbox_app_secret"] ?? ""}`);
  const res = await fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Dropbox token refresh failed [${res.status}]: ${text}`);
  return (JSON.parse(text) as { access_token: string }).access_token;
}

async function uploadToDropbox(
  keys: Record<string, string>,
  folder: string,
  filename: string,
  payload: string,
  keepCopies: number,
): Promise<DestinationResult> {
  try {
    const token = await dropboxAccessToken(keys);
    const path = `${folder.replace(/\/$/, "")}/${filename}`;
    const upload = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({ path, mode: "overwrite", mute: true }),
      },
      body: payload,
    });
    const uploadText = await upload.text();
    if (!upload.ok) throw new Error(`Upload failed [${upload.status}]: ${uploadText}`);

    // Retention: keep only the newest N snapshots.
    const list = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ path: folder.replace(/\/$/, "") }),
    });
    if (list.ok) {
      const entries = ((await list.json()) as {
        entries: { name: string; path_lower: string; ".tag": string }[];
      }).entries
        .filter((entry) => entry[".tag"] === "file" && entry.name.startsWith("ashnight-backup-"))
        .sort((a, b) => (a.name < b.name ? 1 : -1));
      for (const stale of entries.slice(Math.max(1, keepCopies))) {
        await fetch("https://api.dropboxapi.com/2/files/delete_v2", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ path: stale.path_lower }),
        });
      }
    }
    return { provider: "dropbox", ok: true, detail: path };
  } catch (error) {
    return {
      provider: "dropbox",
      ok: false,
      detail: error instanceof Error ? error.message : "Unknown Dropbox error",
    };
  }
}

async function driveAccessToken(keys: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: keys["gdrive_client_id"] ?? "",
      client_secret: keys["gdrive_client_secret"] ?? "",
      refresh_token: keys["gdrive_refresh_token"] ?? "",
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Google token refresh failed [${res.status}]: ${text}`);
  return (JSON.parse(text) as { access_token: string }).access_token;
}

async function uploadToDrive(
  keys: Record<string, string>,
  folderId: string,
  filename: string,
  payload: string,
  keepCopies: number,
): Promise<DestinationResult> {
  try {
    const token = await driveAccessToken(keys);
    const boundary = `ashnight${Date.now()}`;
    const metadata = {
      name: filename,
      mimeType: "application/json",
      ...(folderId ? { parents: [folderId] } : {}),
    };
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
      `${payload}\r\n--${boundary}--`;

    const upload = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );
    const uploadText = await upload.text();
    if (!upload.ok) throw new Error(`Upload failed [${upload.status}]: ${uploadText}`);
    const created = JSON.parse(uploadText) as { id: string; name: string };

    // Retention: prune the oldest snapshots in the same folder.
    const query = encodeURIComponent(
      `name contains 'ashnight-backup-' and trashed = false${folderId ? ` and '${folderId}' in parents` : ""}`,
    );
    const list = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=createdTime desc&fields=files(id,name)&pageSize=200`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (list.ok) {
      const files = ((await list.json()) as { files: { id: string; name: string }[] }).files ?? [];
      for (const stale of files.slice(Math.max(1, keepCopies))) {
        await fetch(`https://www.googleapis.com/drive/v3/files/${stale.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    }
    return { provider: "google_drive", ok: true, detail: created.id };
  } catch (error) {
    return {
      provider: "google_drive",
      ok: false,
      detail: error instanceof Error ? error.message : "Unknown Google Drive error",
    };
  }
}

async function runBackup(force: boolean) {
  const admin = await getAdminClient();

  const { data: settingsRow } = await admin
    .from("platform_settings")
    .select("data")
    .eq("id", true)
    .maybeSingle();
  const settings = (settingsRow?.data ?? {}) as Record<string, Record<string, unknown>>;
  const config = (settings["backups"] ?? {}) as Record<string, unknown>;

  const enabled = config["enabled"] === true;
  if (!enabled && !force) {
    return json({ ok: false, skipped: "Scheduled backups are disabled in the control room." }, 200);
  }

  const { data: keyRows } = await admin.from("integration_keys").select("key, value");
  const keys: Record<string, string> = {};
  for (const row of keyRows ?? []) keys[row.key] = row.value ?? "";

  // Snapshot every table.
  const snapshot: Record<string, unknown> = {};
  for (const table of TABLES) {
    const { data, error } = await admin.from(table).select("*");
    snapshot[table] = error ? { error: error.message } : data;
  }

  if (config["includeStorageIndex"] !== false) {
    const storage: Record<string, unknown> = {};
    for (const bucket of ["avatars", "attachments"]) {
      const { data, error } = await admin.storage.from(bucket).list("", { limit: 1000 });
      storage[bucket] = error ? { error: error.message } : data;
    }
    snapshot["_storage_index"] = storage;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `ashnight-backup-${stamp}.json`;
  const payload = JSON.stringify(
    { generated_at: new Date().toISOString(), tables: TABLES, data: snapshot },
    null,
    0,
  );

  const keepCopies = Number(config["keepCopies"] ?? 30) || 30;
  const destinations: DestinationResult[] = [];

  if (config["dropboxEnabled"] === true) {
    destinations.push(
      await uploadToDropbox(
        keys,
        String(config["dropboxFolder"] ?? "/ashnight-backups"),
        filename,
        payload,
        keepCopies,
      ),
    );
  }
  if (config["driveEnabled"] === true) {
    destinations.push(
      await uploadToDrive(keys, String(config["driveFolderId"] ?? ""), filename, payload, keepCopies),
    );
  }
  if (destinations.length === 0) {
    destinations.push({
      provider: "none",
      ok: false,
      detail: "No backup destination is enabled — turn on Dropbox or Google Drive.",
    });
  }

  const summary = {
    at: new Date().toISOString(),
    ok: destinations.every((entry) => entry.ok),
    file: filename,
    bytes: payload.length,
    tables: TABLES.length,
    destinations,
  };

  await admin
    .from("platform_settings")
    .update({
      data: { ...settings, backups: { ...config, lastRun: summary } } as unknown as never,
    })
    .eq("id", true);

  return json(summary, summary.ok ? 200 : 502);
}

export const Route = createFileRoute("/api/public/hooks/backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authorize(request))) return json({ error: "Unauthorized" }, 401);
        let force = false;
        try {
          const body = (await request.json()) as { force?: boolean };
          force = body?.force === true;
        } catch {
          /* empty body is fine */
        }
        return runBackup(force);
      },
    },
  },
});
