/**
 * Control room → Maintenance & self-healing.
 *
 * One page to keep the whole platform healthy: a health scan that finds known
 * breakage anywhere in the app, one-click repairs that always take a backup
 * snapshot first, an approve/skip/roll-back queue for anything risky, an inbox
 * of errors members actually hit, and a box where an admin can paste an error
 * and have the engine work out the fix.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  CheckCircle2,
  Loader2,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useMaintenanceConfig, RISK_LABEL, STATUS_LABEL, type RepairStatus } from "@/lib/maintenance";
import {
  approveRepairRun,
  clearHandledErrors,
  diagnoseErrorText,
  listRepairRuns,
  revertRepairRun,
  scanAppHealth,
  skipRepairRun,
  stageRepair,
  updateErrorStatus,
} from "@/lib/maintenance.functions";

export const Route = createFileRoute("/ashnight-control/maintenance")({
  head: () => ({
    meta: [
      { title: "Maintenance & Self-Healing | Ashnight Admin" },
      {
        name: "description",
        content:
          "Scan Ashnight for problems, apply automatic repairs with an approval step and a rollback snapshot, and triage errors members hit.",
      },
      { property: "og:title", content: "Maintenance & Self-Healing | Ashnight Admin" },
      {
        property: "og:description",
        content: "Automatic error detection and approved repairs for the whole Ashnight platform.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminMaintenance,
});

function AdminMaintenance() {
  const queryClient = useQueryClient();
  const { value: config, save } = useMaintenanceConfig();
  const [errorText, setErrorText] = useState("");
  const [scannedOnce, setScannedOnce] = useState(false);

  const historyQuery = useQuery({
    queryKey: ["maintenance-history"],
    queryFn: () => listRepairRuns(),
    refetchOnWindowFocus: false,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["maintenance-history"] });
  };

  const scan = useMutation({
    mutationFn: () => scanAppHealth(),
    onSuccess: (result) => {
      const issues = result.findings.filter((f) => f.count > 0).length;
      const fixed = result.findings.filter((f) => f.autoApplied).length;
      toast.success(
        issues ? `${issues} issue(s) found${fixed ? `, ${fixed} fixed automatically` : ""}.` : "Everything looks healthy.",
      );
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const stage = useMutation({
    mutationFn: (key: string) => stageRepair({ data: { key } }),
    onSuccess: (result) => {
      toast[result.runId ? "success" : "info"](
        result.runId ? "Fix staged with a backup — approve it below." : result.summary,
      );
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const approve = useMutation({
    mutationFn: (runId: string) => approveRepairRun({ data: { runId } }),
    onSuccess: (result) => {
      toast.success(result.detail);
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const skip = useMutation({
    mutationFn: (runId: string) => skipRepairRun({ data: { runId } }),
    onSuccess: () => {
      toast.success("Fix skipped — nothing was changed.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revert = useMutation({
    mutationFn: (runId: string) => revertRepairRun({ data: { runId } }),
    onSuccess: (result) => {
      toast.success(`Rolled back ${result.reverted} row(s) from the backup.`);
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const diagnose = useMutation({
    mutationFn: (text: string) => diagnoseErrorText({ data: { text } }),
    onSuccess: (result) => {
      toast[result.matched ? "success" : "info"](result.advice);
      setErrorText("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const markError = useMutation({
    mutationFn: (input: { id: string; status: "open" | "fixed" | "ignored" }) =>
      updateErrorStatus({ data: input }),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  const clearErrors = useMutation({
    mutationFn: () => clearHandledErrors(),
    onSuccess: () => {
      toast.success("Handled errors cleared.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Auto-scan once when the admin opens the page, if they asked for that.
  useEffect(() => {
    if (!config.scanOnOpen || !config.enabled || scannedOnce || scan.isPending) return;
    setScannedOnce(true);
    scan.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.scanOnOpen, config.enabled, scannedOnce]);

  const findings = scan.data?.findings ?? [];
  const problems = findings.filter((f) => f.count > 0);
  const healthy = findings.length > 0 && problems.length === 0;
  const runs = historyQuery.data?.runs ?? [];
  const pending = runs.filter((run) => run.status === "pending");
  const history = runs.filter((run) => run.status !== "pending");
  const errors = historyQuery.data?.errors ?? [];
  const openErrors = errors.filter((row) => row.status === "open");

  const patch = (next: Partial<typeof config>) => {
    void save({ ...config, ...next })
      .then(() => toast.success("Saved."))
      .catch((error: Error) => toast.error(error.message));
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Maintenance & self-healing</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Detects known breakage across bookings, escrow, chat, rooms and accounts, then repairs it — always
            after taking a backup of the exact rows it will touch, so you can approve, skip or roll back.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => historyQuery.refetch()} disabled={historyQuery.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${historyQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={() => scan.mutate()} disabled={scan.isPending}>
            {scan.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <SearchCheck className="mr-2 h-4 w-4" />
            )}
            Run health scan
          </Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Open issues" value={problems.length} tone={problems.length ? "warn" : "ok"} />
        <StatCard label="Fixes awaiting approval" value={pending.length} tone={pending.length ? "warn" : "ok"} />
        <StatCard label="Errors reported by members" value={openErrors.length} tone={openErrors.length ? "warn" : "ok"} />
      </div>

      {/* ------------------------------------------------------------ controls */}
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" /> Engine controls
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Toggle
            label="Self-healing engine"
            hint="Master switch for detection and repairs."
            checked={config.enabled}
            onChange={(enabled) => patch({ enabled })}
          />
          <Toggle
            label="Scan when I open this page"
            hint="Runs a full health scan automatically."
            checked={config.scanOnOpen}
            onChange={(scanOnOpen) => patch({ scanOnOpen })}
          />
          <Toggle
            label="Apply low-risk fixes automatically"
            hint="Missing roles, stale memberships, drifted ratings, references."
            checked={config.autoFixSafe}
            onChange={(autoFixSafe) => patch({ autoFixSafe })}
          />
          <Toggle
            label="Always ask me before risky fixes"
            hint="Escrow releases, thread deletions and cancellations wait for your approval."
            checked={config.requireApprovalForRisky}
            onChange={(requireApprovalForRisky) => patch({ requireApprovalForRisky })}
          />
          <Toggle
            label="Keep rollback backups"
            hint="Stores the before-state of every repaired row."
            checked={config.keepSnapshots}
            onChange={(keepSnapshots) => patch({ keepSnapshots })}
          />
          <Toggle
            label="Log errors members hit"
            hint="Browser errors land in the inbox below."
            checked={config.captureClientErrors}
            onChange={(captureClientErrors) => patch({ captureClientErrors })}
          />
          <div className="space-y-2">
            <Label htmlFor="retention">Keep backups for (days)</Label>
            <Input
              id="retention"
              type="number"
              min={1}
              max={365}
              value={config.snapshotRetentionDays}
              onChange={(event) =>
                patch({ snapshotRetentionDays: Math.max(1, Number(event.target.value) || 30) })
              }
            />
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-border/60 p-4">
          <Toggle
            label="Maintenance mode for members"
            hint="Members see your message; the control room stays open for you."
            checked={config.maintenanceMode}
            onChange={(maintenanceMode) => patch({ maintenanceMode })}
          />
          <Textarea
            className="mt-3"
            rows={2}
            value={config.maintenanceMessage}
            onChange={(event) => patch({ maintenanceMessage: event.target.value })}
          />
        </div>
      </Card>

      {/* --------------------------------------------------------- scan result */}
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Wrench className="h-4 w-4 text-primary" /> Health checks
        </h2>
        {!findings.length ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Run a health scan to check every module for known problems.
          </p>
        ) : healthy ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> All {findings.length} checks passed.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {problems.map((finding) => (
              <div key={finding.key} className="rounded-lg border border-border/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{finding.label}</p>
                  <Badge variant={finding.risk === "safe" ? "secondary" : "destructive"}>
                    {RISK_LABEL[finding.risk]}
                  </Badge>
                  <Badge variant="outline">{finding.count} affected</Badge>
                  {finding.autoApplied ? (
                    <Badge className="bg-emerald-600 text-white">Fixed automatically</Badge>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{finding.summary}</p>
                <p className="mt-1 text-xs text-muted-foreground">{finding.description}</p>
                {finding.detectOnly ? (
                  <p className="mt-2 text-xs font-medium text-amber-600">
                    Needs a human decision — no automatic fix for this one.
                  </p>
                ) : finding.autoApplied ? null : (
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={() => stage.mutate(finding.key)}
                    disabled={stage.isPending}
                  >
                    <Sparkles className="mr-2 h-4 w-4" /> Prepare fix with backup
                  </Button>
                )}
              </div>
            ))}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">
                {findings.length - problems.length} check(s) passed
              </summary>
              <ul className="mt-2 space-y-1">
                {findings
                  .filter((f) => f.count === 0)
                  .map((f) => (
                    <li key={f.key}>✓ {f.label}</li>
                  ))}
              </ul>
            </details>
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------ approval queue */}
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 text-amber-500" /> Fixes awaiting your approval
        </h2>
        {!pending.length ? (
          <p className="mt-3 text-sm text-muted-foreground">Nothing is waiting. Staged fixes appear here first.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {pending.map((run) => (
              <div key={run.id} className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{run.label}</p>
                  <Badge variant="outline">{run.detected} row(s)</Badge>
                  <Badge variant={run.risk === "safe" ? "secondary" : "destructive"}>
                    {RISK_LABEL[run.risk === "safe" ? "safe" : "review"]}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{run.summary}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  A backup of every affected row is stored with this fix, so it can be rolled back after it runs.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => approve.mutate(run.id)} disabled={approve.isPending}>
                    <Check className="mr-2 h-4 w-4" /> Approve & apply
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => skip.mutate(run.id)}
                    disabled={skip.isPending}
                  >
                    <X className="mr-2 h-4 w-4" /> Skip
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* --------------------------------------------------------- manual fix */}
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <SearchCheck className="h-4 w-4 text-primary" /> Report an error and let the system fix it
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste the exact wording you or a member saw. The engine matches it to a known repair, checks how many
          rows are affected and stages the fix for your approval.
        </p>
        <Textarea
          className="mt-3"
          rows={3}
          placeholder='e.g. "JSON object requested, multiple (or no) rows returned"'
          value={errorText}
          onChange={(event) => setErrorText(event.target.value)}
        />
        <Button
          className="mt-3"
          onClick={() => diagnose.mutate(errorText)}
          disabled={diagnose.isPending || errorText.trim().length < 4}
        >
          {diagnose.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Wrench className="mr-2 h-4 w-4" />
          )}
          Diagnose & stage fix
        </Button>
        {diagnose.data?.staged.length ? (
          <ul className="mt-4 space-y-2 text-sm">
            {diagnose.data.staged.map((item) => (
              <li key={item.key} className="rounded-md border border-border/60 p-3">
                <span className="font-medium">{item.label}</span>
                <span className="text-muted-foreground"> — {item.summary}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {/* --------------------------------------------------------- error inbox */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Errors reported from the app
          </h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => clearErrors.mutate()}
            disabled={clearErrors.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Clear handled
          </Button>
        </div>
        {!errors.length ? (
          <p className="mt-3 text-sm text-muted-foreground">No errors have been reported.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {errors.map((row) => (
              <div key={row.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={row.status === "open" ? "destructive" : "secondary"}>{row.status}</Badge>
                  <Badge variant="outline">×{row.occurrences}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {row.route || "unknown page"} · {new Date(row.last_seen_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 break-words text-sm">{row.message}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {row.suggested_repair ? (
                    <Button
                      size="sm"
                      onClick={() => stage.mutate(row.suggested_repair)}
                      disabled={stage.isPending}
                    >
                      <Sparkles className="mr-2 h-4 w-4" /> Stage suggested fix
                    </Button>
                  ) : null}
                  {row.status === "open" ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markError.mutate({ id: row.id, status: "fixed" })}
                      >
                        Mark fixed
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markError.mutate({ id: row.id, status: "ignored" })}
                      >
                        Ignore
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* -------------------------------------------------------- repair history */}
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ArrowLeftRight className="h-4 w-4 text-primary" /> Repair history
        </h2>
        {!history.length ? (
          <p className="mt-3 text-sm text-muted-foreground">No repairs have run yet.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {history.map((run) => (
              <div
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {run.label}{" "}
                    <span className="text-xs text-muted-foreground">
                      · {STATUS_LABEL[(run.status as RepairStatus)] ?? run.status}
                      {run.auto ? " · automatic" : ""}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {run.detail || run.summary} · {new Date(run.created_at).toLocaleString()}
                  </p>
                </div>
                {run.status === "applied" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => revert.mutate(run.id)}
                    disabled={revert.isPending}
                  >
                    <ArrowLeftRight className="mr-2 h-4 w-4" /> Roll back
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-display text-2xl font-semibold ${
          tone === "warn" ? "text-amber-600" : "text-emerald-600"
        }`}
      >
        {value}
      </p>
    </Card>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
