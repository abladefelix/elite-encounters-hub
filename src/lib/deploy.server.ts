/**
 * Server-only deployment sync.
 *
 * Ashnight never auto-deploys. An admin opens Control room → Deploy, sees which
 * commit GitHub has and which commit the live server is running, and presses
 * Sync. Ashnight then calls the deploy hook the admin configured — a tiny
 * listener on the host that runs `git pull`, installs, builds and restarts.
 *
 * Every credential (repository, token, hook URL, hook secret) lives in the
 * admin key vault, so nothing about the deployment path is baked into the code.
 */
import { vaultKeys, adminClient } from "@/lib/payments.server";

export interface DeployConfig {
  repo: string;
  branch: string;
  token: string;
  hookUrl: string;
  hookSecret: string;
}

export async function deployConfig(): Promise<DeployConfig> {
  const keys = await vaultKeys([
    "github_repo",
    "github_branch",
    "github_token",
    "deploy_hook_url",
    "deploy_hook_secret",
  ]);
  return {
    repo: (keys["github_repo"] ?? "").trim().replace(/^https?:\/\/github\.com\//, ""),
    branch: (keys["github_branch"] ?? "").trim() || "main",
    token: (keys["github_token"] ?? "").trim(),
    hookUrl: (keys["deploy_hook_url"] ?? "").trim(),
    hookSecret: (keys["deploy_hook_secret"] ?? "").trim(),
  };
}

export interface DeployRecord {
  commit: string;
  message: string;
  syncedAt: string;
  syncedBy: string;
  outcome: string;
}

async function readDeployRecord(): Promise<DeployRecord | null> {
  const admin = await adminClient();
  const { data } = await admin
    .from("platform_settings")
    .select("data")
    .eq("id", true)
    .maybeSingle();
  const blob = (data?.data ?? {}) as Record<string, unknown>;
  const section = blob["deployment"] as { last?: DeployRecord } | undefined;
  return section?.last ?? null;
}

async function writeDeployRecord(record: DeployRecord) {
  const admin = await adminClient();
  const { data } = await admin
    .from("platform_settings")
    .select("data")
    .eq("id", true)
    .maybeSingle();
  const blob = (data?.data ?? {}) as Record<string, unknown>;
  const next = { ...blob, deployment: { last: record } };
  await admin
    .from("platform_settings")
    .update({ data: next as never })
    .eq("id", true);
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface DeployStatus {
  configured: boolean;
  hookConfigured: boolean;
  repo: string;
  branch: string;
  commits: CommitInfo[];
  latest: CommitInfo | null;
  live: DeployRecord | null;
  upToDate: boolean;
  behindBy: number;
  error: string;
}

const EMPTY: DeployStatus = {
  configured: false,
  hookConfigured: false,
  repo: "",
  branch: "main",
  commits: [],
  latest: null,
  live: null,
  upToDate: false,
  behindBy: 0,
  error: "",
};

/** Reads the last few commits on the configured branch. */
export async function deployStatus(): Promise<DeployStatus> {
  const config = await deployConfig();
  const live = await readDeployRecord();
  if (!config.repo) {
    return { ...EMPTY, live, error: "" };
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ashnight-control",
  };
  if (config.token) headers["Authorization"] = `Bearer ${config.token}`;

  let commits: CommitInfo[] = [];
  let error = "";
  try {
    const response = await fetch(
      `https://api.github.com/repos/${config.repo}/commits?sha=${encodeURIComponent(config.branch)}&per_page=10`,
      { headers },
    );
    if (!response.ok) {
      const body = await response.text();
      error = `GitHub replied ${response.status}: ${body.slice(0, 300)}`;
    } else {
      const payload = (await response.json()) as Array<{
        sha: string;
        html_url: string;
        commit: { message: string; author: { name?: string; date?: string } };
      }>;
      commits = payload.map((entry) => ({
        sha: entry.sha,
        shortSha: entry.sha.slice(0, 7),
        message: (entry.commit.message || "").split("\n")[0] ?? "",
        author: entry.commit.author?.name ?? "unknown",
        date: entry.commit.author?.date ?? "",
        url: entry.html_url,
      }));
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "GitHub could not be reached.";
  }

  const latest = commits[0] ?? null;
  const liveIndex = live ? commits.findIndex((entry) => entry.sha === live.commit) : -1;

  return {
    configured: true,
    hookConfigured: Boolean(config.hookUrl),
    repo: config.repo,
    branch: config.branch,
    commits,
    latest,
    live,
    upToDate: Boolean(latest && live && live.commit === latest.sha),
    behindBy: liveIndex > 0 ? liveIndex : 0,
    error,
  };
}

async function sign(body: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface SyncResult {
  ok: boolean;
  commit: string;
  message: string;
  detail: string;
}

/**
 * Calls the host's deploy hook and records the commit that was shipped.
 * Manual by design: nothing here runs on a schedule.
 */
export async function runDeploySync(actor: {
  id: string;
  label: string;
}): Promise<SyncResult> {
  const config = await deployConfig();
  if (!config.repo) {
    throw new Error(
      "Add the GitHub repository in Control room → Keys & security (github_repo) first.",
    );
  }
  if (!config.hookUrl) {
    throw new Error(
      "Add the deploy hook URL in Control room → Keys & security (deploy_hook_url) first.",
    );
  }

  const status = await deployStatus();
  const target = status.latest;
  if (!target) throw new Error(status.error || "GitHub returned no commits for that branch.");

  const payload = JSON.stringify({
    repo: config.repo,
    branch: config.branch,
    commit: target.sha,
    requestedBy: actor.label,
    requestedAt: new Date().toISOString(),
  });

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.hookSecret) headers["X-Ashnight-Signature"] = await sign(payload, config.hookSecret);

  let ok = false;
  let detail = "";
  try {
    const response = await fetch(config.hookUrl, { method: "POST", headers, body: payload });
    detail = (await response.text()).slice(0, 1000);
    ok = response.ok;
    if (!ok) detail = `Deploy hook replied ${response.status}: ${detail}`;
  } catch (cause) {
    detail = cause instanceof Error ? cause.message : "The deploy hook could not be reached.";
  }

  const record: DeployRecord = {
    commit: target.sha,
    message: target.message,
    syncedAt: new Date().toISOString(),
    syncedBy: actor.label,
    outcome: ok ? "success" : `failed: ${detail}`,
  };
  if (ok) await writeDeployRecord(record);

  const admin = await adminClient();
  await admin.from("admin_audit_log").insert({
    actor_id: actor.id,
    area: "deployment",
    action: ok ? "sync_succeeded" : "sync_failed",
    target: `${config.repo}@${target.shortSha}`,
    note: target.message,
    details: { detail } as never,
  });

  return { ok, commit: target.sha, message: target.message, detail };
}
