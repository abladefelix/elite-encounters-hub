/**
 * Server-only self-healing engine.
 *
 * Every known failure mode in Ashnight is described here as a repair: how to
 * detect it, how to fix it, and how to roll the fix back. Nothing is applied
 * blind — each repair first takes a snapshot of the exact rows it will touch
 * and writes it to `repair_runs`, so an admin can approve, skip or undo it.
 *
 * Reached only through `maintenance.functions.ts`, which re-checks the admin
 * role of the caller first.
 */
import { admin, logActivity } from "./identity.server";
import { DEFAULT_MAINTENANCE_CONFIG, type MaintenanceConfig } from "./maintenance";

type Db = Awaited<ReturnType<typeof admin>>;
type Row = Record<string, unknown>;
export interface Snapshot {
  rows: Row[];
  note?: string;
}

export interface RepairDefinition {
  key: string;
  label: string;
  description: string;
  area: string;
  risk: "safe" | "review";
  /** Detect-only checks report a problem a human has to decide on. */
  detectOnly?: boolean;
  /** Error text that points at this repair. */
  patterns?: RegExp[];
  detect(db: Db): Promise<{ count: number; summary: string; snapshot: Snapshot }>;
  apply?(db: Db, snapshot: Snapshot): Promise<{ applied: number; detail: string }>;
  revert?(db: Db, snapshot: Snapshot): Promise<{ reverted: number }>;
}

const HOUR = 60 * 60 * 1000;
const str = (value: unknown) => (typeof value === "string" ? value : "");
const num = (value: unknown) => (typeof value === "number" ? value : 0);

function reference(prefix: string) {
  const tail = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `ASH-${prefix}-${tail}`;
}

/* ------------------------------------------------------------------ registry */

export const REPAIRS: RepairDefinition[] = [
  {
    key: "settings_row",
    label: "Platform settings row",
    description:
      "Every admin setting lives in one row. If it is missing, the whole app falls back to defaults and admin saves fail.",
    area: "settings",
    risk: "safe",
    patterns: [/platform_settings/i, /settings.*(missing|not found)/i],
    async detect(db) {
      const { data } = await db.from("platform_settings").select("id").eq("id", true).maybeSingle();
      return data
        ? { count: 0, summary: "Settings row present.", snapshot: { rows: [] } }
        : { count: 1, summary: "The platform settings row is missing.", snapshot: { rows: [] } };
    },
    async apply(db) {
      const { error } = await db.from("platform_settings").insert({ id: true, data: {} });
      if (error) throw new Error(error.message);
      return { applied: 1, detail: "Recreated the settings row with defaults." };
    },
  },
  {
    key: "missing_roles",
    label: "Members with no role",
    description:
      "A member without a role row cannot see rooms, chat or bookings. The fix gives them the client role.",
    area: "users",
    risk: "safe",
    patterns: [/user_roles/i, /no role/i, /permission denied/i],
    async detect(db) {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        db.from("profiles").select("id, display_name").limit(5000),
        db.from("user_roles").select("user_id").limit(20000),
      ]);
      const withRole = new Set((roles ?? []).map((r) => str(r.user_id)));
      const rows = (profiles ?? [])
        .filter((p) => !withRole.has(str(p.id)))
        .map((p) => ({ id: str(p.id), display_name: str(p.display_name) }));
      return {
        count: rows.length,
        summary: rows.length ? `${rows.length} member(s) have no role assigned.` : "Every member has a role.",
        snapshot: { rows },
      };
    },
    async apply(db, snapshot) {
      if (!snapshot.rows.length) return { applied: 0, detail: "Nothing to do." };
      const { error } = await db
        .from("user_roles")
        .insert(snapshot.rows.map((r) => ({ user_id: str(r.id), role: "client" as const })));
      if (error) throw new Error(error.message);
      return { applied: snapshot.rows.length, detail: "Granted the client role." };
    },
    async revert(db, snapshot) {
      for (const row of snapshot.rows) {
        await db.from("user_roles").delete().eq("user_id", str(row.id)).eq("role", "client");
      }
      return { reverted: snapshot.rows.length };
    },
  },
  {
    key: "thread_participants",
    label: "Chat threads missing participants",
    description:
      "Group and one-to-one threads keep a participant row per member. A missing row hides the thread from that member's inbox.",
    area: "moderation",
    risk: "safe",
    patterns: [/thread_participants/i, /thread.*(not visible|missing)/i],
    async detect(db) {
      const { data: threads } = await db
        .from("threads")
        .select("id, client_id, specialist_id")
        .limit(4000);
      const { data: parts } = await db.from("thread_participants").select("thread_id, user_id").limit(20000);
      const seen = new Set((parts ?? []).map((p) => `${str(p.thread_id)}:${str(p.user_id)}`));
      const rows: Row[] = [];
      for (const thread of threads ?? []) {
        const pairs: [string, string][] = [
          [str(thread.client_id), "client"],
          [str(thread.specialist_id), "specialist"],
        ];
        for (const [userId, role] of pairs) {
          if (!userId) continue;
          if (!seen.has(`${str(thread.id)}:${userId}`)) {
            rows.push({ thread_id: str(thread.id), user_id: userId, participant_role: role });
          }
        }
      }
      return {
        count: rows.length,
        summary: rows.length ? `${rows.length} participant row(s) missing.` : "Every thread is fully wired.",
        snapshot: { rows },
      };
    },
    async apply(db, snapshot) {
      if (!snapshot.rows.length) return { applied: 0, detail: "Nothing to do." };
      const { error } = await db.from("thread_participants").upsert(
        snapshot.rows.map((r) => ({
          thread_id: str(r.thread_id),
          user_id: str(r.user_id),
          participant_role: str(r.participant_role),
        })),
        { onConflict: "thread_id,user_id" },
      );
      if (error) throw new Error(error.message);
      return { applied: snapshot.rows.length, detail: "Restored the missing participants." };
    },
  },
  {
    key: "duplicate_threads",
    label: "Duplicate empty chat threads",
    description:
      "Two threads for the same pair break profile and chat lookups with a “multiple rows returned” error. Empty duplicates are removed and the conversation with the messages is kept.",
    area: "moderation",
    risk: "review",
    patterns: [
      /multiple \(or no\) rows returned/i,
      /JSON object requested/i,
      /duplicate.*thread/i,
    ],
    async detect(db) {
      const { data: threads } = await db
        .from("threads")
        .select("id, client_id, specialist_id, is_group, created_at, last_message, last_message_at, room")
        .eq("is_group", false)
        .limit(5000);
      const groups = new Map<string, Row[]>();
      for (const thread of threads ?? []) {
        const key = `${str(thread.client_id)}:${str(thread.specialist_id)}`;
        groups.set(key, [...(groups.get(key) ?? []), thread as Row]);
      }
      const candidates = [...groups.values()].filter((list) => list.length > 1).flat();
      if (!candidates.length) {
        return { count: 0, summary: "No duplicate threads.", snapshot: { rows: [] } };
      }
      const ids = candidates.map((t) => str(t.id));
      const { data: messages } = await db.from("messages").select("thread_id").in("thread_id", ids);
      const counts = new Map<string, number>();
      for (const message of messages ?? []) {
        const id = str(message.thread_id);
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      const rows: Row[] = [];
      for (const list of groups.values()) {
        if (list.length < 2) continue;
        const sorted = [...list].sort((a, b) => (counts.get(str(b.id)) ?? 0) - (counts.get(str(a.id)) ?? 0));
        for (const extra of sorted.slice(1)) {
          if ((counts.get(str(extra.id)) ?? 0) === 0) rows.push(extra);
        }
      }
      return {
        count: rows.length,
        summary: rows.length
          ? `${rows.length} empty duplicate thread(s) can be removed.`
          : "Duplicates found but all of them hold messages — review them by hand.",
        snapshot: { rows },
      };
    },
    async apply(db, snapshot) {
      let applied = 0;
      for (const row of snapshot.rows) {
        const id = str(row.id);
        await db.from("thread_participants").delete().eq("thread_id", id);
        const { error } = await db.from("threads").delete().eq("id", id);
        if (!error) applied += 1;
      }
      return { applied, detail: `Removed ${applied} empty duplicate thread(s).` };
    },
    async revert(db, snapshot) {
      let reverted = 0;
      for (const row of snapshot.rows) {
        const { error } = await db.from("threads").insert({
          id: str(row.id),
          client_id: str(row.client_id),
          specialist_id: str(row.specialist_id),
          last_message: str(row.last_message),
        });
        if (!error) reverted += 1;
      }
      return { reverted };
    },
  },
  {
    key: "escrow_overdue_release",
    label: "Escrow past its release time",
    description:
      "Money sitting in “clearing” after the hold window has elapsed should have paid out to the Doll. This releases it.",
    area: "escrow",
    risk: "review",
    patterns: [/escrow/i, /payout.*(stuck|pending)/i, /clearing/i],
    async detect(db) {
      const { data } = await db
        .from("escrow_entries")
        .select("id, state, release_at, payout_amount, specialist_id, label")
        .eq("state", "clearing")
        .lt("release_at", new Date().toISOString())
        .limit(500);
      const rows = (data ?? []) as Row[];
      return {
        count: rows.length,
        summary: rows.length
          ? `${rows.length} escrow entr(ies) are past their release time.`
          : "No overdue escrow.",
        snapshot: { rows },
      };
    },
    async apply(db, snapshot) {
      let applied = 0;
      for (const row of snapshot.rows) {
        const { error } = await db
          .from("escrow_entries")
          .update({ state: "released", released_at: new Date().toISOString() })
          .eq("id", str(row.id))
          .eq("state", "clearing");
        if (!error) applied += 1;
      }
      return { applied, detail: `Released ${applied} escrow entr(ies) to the Dolls.` };
    },
    async revert(db, snapshot) {
      let reverted = 0;
      for (const row of snapshot.rows) {
        const { error } = await db
          .from("escrow_entries")
          .update({ state: "clearing", released_at: null })
          .eq("id", str(row.id));
        if (!error) reverted += 1;
      }
      return { reverted };
    },
  },
  {
    key: "escrow_missing_reference",
    label: "Money rows without a reference code",
    description:
      "Every escrow movement needs a unique ASH-ESC reference for the books. Missing codes are generated.",
    area: "finance",
    risk: "safe",
    patterns: [/reference/i],
    async detect(db) {
      const { data } = await db
        .from("escrow_entries")
        .select("id, reference, label")
        .or("reference.is.null,reference.eq.")
        .limit(500);
      const rows = (data ?? []) as Row[];
      return {
        count: rows.length,
        summary: rows.length ? `${rows.length} escrow row(s) have no reference.` : "Every money row is referenced.",
        snapshot: { rows },
      };
    },
    async apply(db, snapshot) {
      let applied = 0;
      for (const row of snapshot.rows) {
        const { error } = await db
          .from("escrow_entries")
          .update({ reference: reference("ESC") })
          .eq("id", str(row.id));
        if (!error) applied += 1;
      }
      return { applied, detail: `Issued ${applied} reference code(s).` };
    },
  },
  {
    key: "stale_group_requests",
    label: "Ash group requests nobody answered",
    description:
      "Unpaid group requests older than 48 hours keep Dolls' availability blocked. They are cancelled — no payment was ever taken.",
    area: "groups",
    risk: "review",
    patterns: [/group booking/i, /group.*request/i],
    async detect(db) {
      const cutoff = new Date(Date.now() - 48 * HOUR).toISOString();
      const { data } = await db
        .from("group_bookings")
        .select("id, status, created_at, service_name, client_id")
        .eq("status", "requested")
        .is("paid_at", null)
        .lt("created_at", cutoff)
        .limit(200);
      const rows = (data ?? []) as Row[];
      return {
        count: rows.length,
        summary: rows.length ? `${rows.length} stale group request(s).` : "No stale group requests.",
        snapshot: { rows },
      };
    },
    async apply(db, snapshot) {
      let applied = 0;
      for (const row of snapshot.rows) {
        const { error } = await db
          .from("group_bookings")
          .update({ status: "cancelled" })
          .eq("id", str(row.id))
          .eq("status", "requested");
        if (!error) applied += 1;
      }
      return { applied, detail: `Closed ${applied} stale group request(s).` };
    },
    async revert(db, snapshot) {
      let reverted = 0;
      for (const row of snapshot.rows) {
        const { error } = await db
          .from("group_bookings")
          .update({ status: "requested" })
          .eq("id", str(row.id));
        if (!error) reverted += 1;
      }
      return { reverted };
    },
  },
  {
    key: "expired_memberships",
    label: "Expired memberships still marked active",
    description:
      "A membership past its period end must stop granting room access. This cancels the stale ones.",
    area: "rooms",
    risk: "safe",
    patterns: [/membership/i, /room access/i, /subscription/i],
    async detect(db) {
      const { data } = await db
        .from("memberships")
        .select("id, user_id, room, status, current_period_end")
        .eq("status", "active")
        .lt("current_period_end", new Date().toISOString())
        .limit(500);
      const rows = (data ?? []) as Row[];
      return {
        count: rows.length,
        summary: rows.length ? `${rows.length} membership(s) have expired.` : "No expired memberships.",
        snapshot: { rows },
      };
    },
    async apply(db, snapshot) {
      let applied = 0;
      for (const row of snapshot.rows) {
        const { error } = await db
          .from("memberships")
          .update({ status: "cancelled" })
          .eq("id", str(row.id));
        if (!error) applied += 1;
      }
      return { applied, detail: `Cancelled ${applied} expired membership(s).` };
    },
    async revert(db, snapshot) {
      let reverted = 0;
      for (const row of snapshot.rows) {
        const { error } = await db.from("memberships").update({ status: "active" }).eq("id", str(row.id));
        if (!error) reverted += 1;
      }
      return { reverted };
    },
  },
  {
    key: "rating_drift",
    label: "Star ratings out of sync",
    description:
      "Profile ratings are an average of the reviews. If they drift apart the directory shows the wrong score.",
    area: "performance",
    risk: "safe",
    patterns: [/rating/i, /stars/i],
    async detect(db) {
      const { data: ratings } = await db.from("ratings").select("rated_id, stars").limit(20000);
      const totals = new Map<string, { sum: number; n: number }>();
      for (const rating of ratings ?? []) {
        const id = str(rating.rated_id);
        const current = totals.get(id) ?? { sum: 0, n: 0 };
        totals.set(id, { sum: current.sum + num(rating.stars), n: current.n + 1 });
      }
      const { data: profiles } = await db.from("profiles").select("id, rating").limit(5000);
      const rows: Row[] = [];
      for (const profile of profiles ?? []) {
        const id = str(profile.id);
        const stat = totals.get(id);
        const expected = stat ? Math.round((stat.sum / stat.n) * 100) / 100 : 0;
        if (Math.abs(num(profile.rating) - expected) > 0.011) {
          rows.push({ id, rating: num(profile.rating), expected });
        }
      }
      return {
        count: rows.length,
        summary: rows.length ? `${rows.length} profile rating(s) drifted.` : "Ratings match the reviews.",
        snapshot: { rows },
      };
    },
    async apply(db, snapshot) {
      let applied = 0;
      for (const row of snapshot.rows) {
        const { error } = await db.from("profiles").update({ rating: num(row.expected) }).eq("id", str(row.id));
        if (!error) applied += 1;
      }
      return { applied, detail: `Recalculated ${applied} rating(s).` };
    },
    async revert(db, snapshot) {
      let reverted = 0;
      for (const row of snapshot.rows) {
        const { error } = await db.from("profiles").update({ rating: num(row.rating) }).eq("id", str(row.id));
        if (!error) reverted += 1;
      }
      return { reverted };
    },
  },
  {
    key: "orphan_notifications",
    label: "Notifications pointing at deleted chats",
    description:
      "A notification whose thread no longer exists sends the member to a dead page. Those links are cleared.",
    area: "notifications",
    risk: "safe",
    patterns: [/notification/i, /dead link/i],
    async detect(db) {
      const { data: notifications } = await db
        .from("notifications")
        .select("id, link")
        .like("link", "%thread=%")
        .limit(2000);
      const ids = new Set<string>();
      const parsed = (notifications ?? []).map((row) => {
        const link = str(row.link);
        const threadId = link.split("thread=")[1]?.split("&")[0] ?? "";
        if (threadId) ids.add(threadId);
        return { id: str(row.id), link, thread_id: threadId };
      });
      if (!ids.size) return { count: 0, summary: "No chat links to check.", snapshot: { rows: [] } };
      const { data: threads } = await db.from("threads").select("id").in("id", [...ids]);
      const alive = new Set((threads ?? []).map((t) => str(t.id)));
      const rows = parsed.filter((row) => row.thread_id && !alive.has(row.thread_id)) as Row[];
      return {
        count: rows.length,
        summary: rows.length ? `${rows.length} notification(s) link to a deleted chat.` : "Every link resolves.",
        snapshot: { rows },
      };
    },
    async apply(db, snapshot) {
      let applied = 0;
      for (const row of snapshot.rows) {
        const { error } = await db.from("notifications").update({ link: "" }).eq("id", str(row.id));
        if (!error) applied += 1;
      }
      return { applied, detail: `Cleared ${applied} dead link(s).` };
    },
    async revert(db, snapshot) {
      let reverted = 0;
      for (const row of snapshot.rows) {
        const { error } = await db.from("notifications").update({ link: str(row.link) }).eq("id", str(row.id));
        if (!error) reverted += 1;
      }
      return { reverted };
    },
  },
  {
    key: "missing_hourly_rate",
    label: "Approved Dolls with no hourly rate",
    description:
      "A Doll without a rate makes the in-chat booking form fail. Set a rate for each one from Users — the platform must never guess a price.",
    area: "users",
    risk: "review",
    detectOnly: true,
    patterns: [/hourly rate/i, /rate not set/i],
    async detect(db) {
      const { data } = await db
        .from("profiles")
        .select("id, display_name, hourly_rate, vetting")
        .eq("vetting", "approved")
        .lte("hourly_rate", 0)
        .limit(500);
      const rows = (data ?? []) as Row[];
      return {
        count: rows.length,
        summary: rows.length ? `${rows.length} approved member(s) have no hourly rate.` : "Every rate is set.",
        snapshot: { rows },
      };
    },
  },
  {
    key: "group_share_mismatch",
    label: "Ash group payout shares not 100%",
    description:
      "A group whose member shares do not add up to 100% cannot be booked. Fix the roster shares under Ash groups.",
    area: "groups",
    risk: "review",
    detectOnly: true,
    patterns: [/share/i, /must total 100/i],
    async detect(db) {
      const { data: members } = await db
        .from("specialist_group_members")
        .select("group_id, share_pct, active")
        .eq("active", true)
        .limit(5000);
      const totals = new Map<string, number>();
      for (const member of members ?? []) {
        const id = str(member.group_id);
        totals.set(id, (totals.get(id) ?? 0) + num(member.share_pct));
      }
      const rows = [...totals.entries()]
        .filter(([, total]) => Math.abs(total - 100) > 0.01)
        .map(([groupId, total]) => ({ group_id: groupId, total }));
      return {
        count: rows.length,
        summary: rows.length ? `${rows.length} group roster(s) do not total 100%.` : "Every roster totals 100%.",
        snapshot: { rows },
      };
    },
  },
];

export const REPAIR_BY_KEY = new Map(REPAIRS.map((repair) => [repair.key, repair]));

/* ------------------------------------------------------------------ settings */

async function readConfig(db: Db): Promise<MaintenanceConfig> {
  const { data } = await db.from("platform_settings").select("data").eq("id", true).maybeSingle();
  const blob = (data?.data ?? {}) as Record<string, unknown>;
  const section = (blob["maintenance"] ?? {}) as Partial<MaintenanceConfig>;
  return { ...DEFAULT_MAINTENANCE_CONFIG, ...section };
}

/* --------------------------------------------------------------------- runs */

export interface RunRow {
  id: string;
  repair_key: string;
  label: string;
  risk: string;
  status: string;
  detected: number;
  applied: number;
  summary: string;
  detail: string;
  auto: boolean;
  created_at: string;
  applied_at: string | null;
}

async function insertRun(
  db: Db,
  input: {
    repair: RepairDefinition;
    actorId: string;
    detected: number;
    summary: string;
    snapshot: Snapshot;
    auto: boolean;
    keepSnapshot: boolean;
    errorId?: string | null;
  },
) {
  const { data, error } = await db
    .from("repair_runs")
    .insert({
      repair_key: input.repair.key,
      label: input.repair.label,
      risk: input.repair.risk,
      status: "pending",
      detected: input.detected,
      summary: input.summary,
      snapshot: (input.keepSnapshot ? input.snapshot : { rows: [], note: "snapshot disabled" }) as never,
      requested_by: input.actorId,
      auto: input.auto,
      error_id: input.errorId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return str(data.id);
}

async function applyRun(db: Db, runId: string, actorId: string) {
  const { data: run, error } = await db.from("repair_runs").select("*").eq("id", runId).single();
  if (error) throw new Error(error.message);
  if (str(run.status) !== "pending") throw new Error("That repair was already handled.");
  const repair = REPAIR_BY_KEY.get(str(run.repair_key));
  if (!repair?.apply) throw new Error("This check has no automatic fix — handle it from its own admin page.");

  const snapshot = (run.snapshot ?? { rows: [] }) as unknown as Snapshot;
  try {
    const result = await repair.apply(db, snapshot);
    await db
      .from("repair_runs")
      .update({
        status: "applied",
        applied: result.applied,
        detail: result.detail,
        approved_by: actorId,
        applied_at: new Date().toISOString(),
      })
      .eq("id", runId);
    await db
      .from("system_errors")
      .update({ status: "fixed" })
      .eq("suggested_repair", repair.key)
      .eq("status", "open");
    await logActivity({
      actorId,
      area: "maintenance",
      event: `Applied repair: ${repair.label}`,
      severity: "warn",
      target: repair.key,
      details: { applied: result.applied, runId },
    });
    return { ok: true as const, applied: result.applied, detail: result.detail };
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : "Unknown failure";
    await db.from("repair_runs").update({ status: "failed", detail }).eq("id", runId);
    throw new Error(detail);
  }
}

/* -------------------------------------------------------------------- public */

export interface Finding {
  key: string;
  label: string;
  description: string;
  area: string;
  risk: "safe" | "review";
  detectOnly: boolean;
  count: number;
  summary: string;
  runId: string | null;
  autoApplied: boolean;
}

export async function runHealthScan(actorId: string, options?: { auto?: boolean }) {
  const db = await admin();
  const config = await readConfig(db);
  const findings: Finding[] = [];

  for (const repair of REPAIRS) {
    let detection: Awaited<ReturnType<RepairDefinition["detect"]>>;
    try {
      detection = await repair.detect(db);
    } catch (cause) {
      findings.push({
        key: repair.key,
        label: repair.label,
        description: repair.description,
        area: repair.area,
        risk: repair.risk,
        detectOnly: true,
        count: 0,
        summary: `Check failed: ${cause instanceof Error ? cause.message : "unknown"}`,
        runId: null,
        autoApplied: false,
      });
      continue;
    }

    const fixable = Boolean(repair.apply) && !repair.detectOnly;
    let runId: string | null = null;
    let autoApplied = false;

    if (detection.count > 0 && fixable && config.enabled) {
      runId = await insertRun(db, {
        repair,
        actorId,
        detected: detection.count,
        summary: detection.summary,
        snapshot: detection.snapshot,
        auto: options?.auto === true,
        keepSnapshot: config.keepSnapshots,
      });
      const canAutoApply =
        repair.risk === "safe" ? config.autoFixSafe : !config.requireApprovalForRisky;
      if (canAutoApply) {
        try {
          await applyRun(db, runId, actorId);
          autoApplied = true;
        } catch {
          autoApplied = false;
        }
      }
    }

    findings.push({
      key: repair.key,
      label: repair.label,
      description: repair.description,
      area: repair.area,
      risk: repair.risk,
      detectOnly: repair.detectOnly === true || !repair.apply,
      count: detection.count,
      summary: detection.summary,
      runId,
      autoApplied,
    });
  }

  await pruneSnapshots(db, config.snapshotRetentionDays);
  await logActivity({
    actorId,
    area: "maintenance",
    event: "Ran a health scan",
    severity: "info",
    details: { issues: findings.filter((f) => f.count > 0).length },
  });

  return { findings, scannedAt: new Date().toISOString(), config };
}

async function pruneSnapshots(db: Db, days: number) {
  if (!days || days < 1) return;
  const cutoff = new Date(Date.now() - days * 24 * HOUR).toISOString();
  await db
    .from("repair_runs")
    .update({ snapshot: { rows: [], note: "snapshot expired" } as never })
    .lt("created_at", cutoff)
    .neq("status", "pending");
}

export async function prepareRepair(actorId: string, key: string, errorId?: string | null) {
  const db = await admin();
  const config = await readConfig(db);
  const repair = REPAIR_BY_KEY.get(key);
  if (!repair) throw new Error("Unknown repair.");
  if (!repair.apply) throw new Error("This check has no automatic fix.");
  const detection = await repair.detect(db);
  if (!detection.count) return { runId: null, detected: 0, summary: detection.summary };
  const runId = await insertRun(db, {
    repair,
    actorId,
    detected: detection.count,
    summary: detection.summary,
    snapshot: detection.snapshot,
    auto: false,
    keepSnapshot: config.keepSnapshots,
    errorId: errorId ?? null,
  });
  return { runId, detected: detection.count, summary: detection.summary };
}

export async function approveRepair(actorId: string, runId: string) {
  const db = await admin();
  return applyRun(db, runId, actorId);
}

export async function skipRepair(actorId: string, runId: string, note: string) {
  const db = await admin();
  const { error } = await db
    .from("repair_runs")
    .update({ status: "skipped", approved_by: actorId, detail: note || "Skipped by admin." })
    .eq("id", runId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);
  await logActivity({ actorId, area: "maintenance", event: "Skipped a repair", target: runId });
  return { ok: true as const };
}

export async function revertRepair(actorId: string, runId: string) {
  const db = await admin();
  const { data: run, error } = await db.from("repair_runs").select("*").eq("id", runId).single();
  if (error) throw new Error(error.message);
  if (str(run.status) !== "applied") throw new Error("Only an applied repair can be rolled back.");
  const repair = REPAIR_BY_KEY.get(str(run.repair_key));
  if (!repair?.revert) throw new Error("This repair cannot be rolled back automatically.");
  const snapshot = (run.snapshot ?? { rows: [] }) as unknown as Snapshot;
  if (!snapshot.rows?.length) throw new Error("The backup snapshot for this repair is no longer available.");
  const result = await repair.revert(db, snapshot);
  await db
    .from("repair_runs")
    .update({ status: "reverted", detail: `Rolled back ${result.reverted} row(s).`, approved_by: actorId })
    .eq("id", runId);
  await logActivity({
    actorId,
    area: "maintenance",
    event: `Rolled back repair: ${repair.label}`,
    severity: "warn",
    target: repair.key,
  });
  return { ok: true as const, reverted: result.reverted };
}

export async function listRuns(limit = 40) {
  const db = await admin();
  const { data, error } = await db
    .from("repair_runs")
    .select("id, repair_key, label, risk, status, detected, applied, summary, detail, auto, created_at, applied_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RunRow[];
}

/* ------------------------------------------------------------- error inbox */

export interface ErrorRow {
  id: string;
  message: string;
  route: string;
  source: string;
  severity: string;
  status: string;
  occurrences: number;
  suggested_repair: string;
  first_seen_at: string;
  last_seen_at: string;
}

function fingerprintOf(message: string, route: string) {
  return `${route}|${message}`.toLowerCase().replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "<id>").slice(0, 300);
}

export function matchRepairs(text: string) {
  const haystack = text.toLowerCase();
  return REPAIRS.filter((repair) =>
    (repair.patterns ?? []).some((pattern) => pattern.test(haystack)),
  );
}

export async function recordError(input: {
  message: string;
  stack?: string;
  route?: string;
  source?: string;
  severity?: string;
  userId?: string | null;
}) {
  const db = await admin();
  const config = await readConfig(db);
  if (!config.captureClientErrors && input.source !== "admin") return { ok: false as const };
  const message = input.message.slice(0, 1000);
  const route = (input.route ?? "").slice(0, 300);
  const fingerprint = fingerprintOf(message, route);
  const suggested = matchRepairs(`${message} ${input.stack ?? ""}`)[0]?.key ?? "";

  const { data: existing } = await db
    .from("system_errors")
    .select("id, occurrences")
    .eq("fingerprint", fingerprint)
    .maybeSingle();

  if (existing) {
    await db
      .from("system_errors")
      .update({
        occurrences: num(existing.occurrences) + 1,
        last_seen_at: new Date().toISOString(),
        status: "open",
      })
      .eq("id", str(existing.id));
    return { ok: true as const, id: str(existing.id), suggested };
  }

  const { data, error } = await db
    .from("system_errors")
    .insert({
      fingerprint,
      message,
      stack: (input.stack ?? "").slice(0, 6000),
      route,
      source: input.source ?? "client",
      severity: input.severity ?? "error",
      suggested_repair: suggested,
      user_id: input.userId ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false as const };
  return { ok: true as const, id: str(data.id), suggested };
}

export async function listErrors(limit = 50) {
  const db = await admin();
  const { data, error } = await db
    .from("system_errors")
    .select("id, message, route, source, severity, status, occurrences, suggested_repair, first_seen_at, last_seen_at")
    .order("last_seen_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ErrorRow[];
}

export async function setErrorStatus(actorId: string, id: string, status: string) {
  const db = await admin();
  const { error } = await db.from("system_errors").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  await logActivity({ actorId, area: "maintenance", event: `Marked an error ${status}`, target: id });
  return { ok: true as const };
}

export async function clearResolvedErrors(actorId: string) {
  const db = await admin();
  const { error } = await db.from("system_errors").delete().neq("status", "open");
  if (error) throw new Error(error.message);
  await logActivity({ actorId, area: "maintenance", event: "Cleared handled errors" });
  return { ok: true as const };
}

/**
 * Free-text triage: an admin pastes the error they saw and the engine works out
 * which repairs address it, then stages each one for approval.
 */
export async function diagnoseText(actorId: string, text: string) {
  const trimmed = text.trim();
  if (trimmed.length < 4) throw new Error("Describe the error in a few more words.");
  const recorded = await recordError({
    message: trimmed,
    source: "admin",
    severity: "error",
    userId: actorId,
  });
  const matches = matchRepairs(trimmed);
  const staged: { key: string; label: string; detected: number; summary: string; runId: string | null }[] = [];

  for (const repair of matches) {
    if (!repair.apply) {
      const db = await admin();
      const detection = await repair.detect(db);
      staged.push({
        key: repair.key,
        label: repair.label,
        detected: detection.count,
        summary: detection.summary,
        runId: null,
      });
      continue;
    }
    const prepared = await prepareRepair(actorId, repair.key, recorded.ok ? recorded.id : null);
    staged.push({
      key: repair.key,
      label: repair.label,
      detected: prepared.detected,
      summary: prepared.summary,
      runId: prepared.runId,
    });
  }

  return {
    matched: matches.length,
    staged,
    errorId: recorded.ok ? recorded.id : null,
    advice: matches.length
      ? "Review each staged fix below — approve the ones you want applied, or skip them."
      : "No known repair matches that wording. The report was logged for review; try pasting the exact error text, or run a full health scan.",
  };
}
