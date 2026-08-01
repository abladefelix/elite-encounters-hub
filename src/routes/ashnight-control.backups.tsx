import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CloudUpload, HardDriveDownload, Loader2, Play, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useBackupConfig, type BackupConfig } from "@/lib/backups";
import {
  maskValue,
  useIntegrationKeyMutations,
  useIntegrationKeys,
} from "@/lib/integration-keys";

const DROPBOX_KEYS = [
  { key: "dropbox_app_key", label: "App key", secret: false },
  { key: "dropbox_app_secret", label: "App secret", secret: true },
  { key: "dropbox_refresh_token", label: "Refresh token", secret: true },
] as const;

const DRIVE_KEYS = [
  { key: "gdrive_client_id", label: "OAuth client ID", secret: false },
  { key: "gdrive_client_secret", label: "OAuth client secret", secret: true },
  { key: "gdrive_refresh_token", label: "Refresh token", secret: true },
] as const;

export const Route = createFileRoute("/ashnight-control/backups")({
  head: () => ({
    meta: [
      { title: "Backups & Restore | Ashnight Admin" },
      {
        name: "description",
        content:
          "Configure the Dropbox and Google Drive accounts Ashnight backs up to every night, set retention and run a snapshot on demand.",
      },
      { property: "og:title", content: "Backups & Restore | Ashnight Admin" },
      {
        property: "og:description",
        content: "Daily off-site snapshots to Dropbox and Google Drive with retention control.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminBackups,
});

function AdminBackups() {
  const { value, save, loading } = useBackupConfig();
  const keysQuery = useIntegrationKeys();
  const { upsert } = useIntegrationKeyMutations();
  const [draft, setDraft] = useState<BackupConfig>(value);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!loading) setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, JSON.stringify(value)]);

  const stored = new Map((keysQuery.data ?? []).map((row) => [row.key, row.value]));

  function set<K extends keyof BackupConfig>(key: K, next: BackupConfig[K]) {
    setDraft((current) => ({ ...current, [key]: next }));
  }

  async function persist() {
    try {
      await save(draft);
      toast.success("Backup settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save backup settings");
    }
  }

  async function runNow() {
    setRunning(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const response = await fetch("/api/public/hooks/backup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ force: true }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        error?: string;
        file?: string;
        destinations?: { provider: string; ok: boolean; detail: string }[];
      };
      if (!response.ok || body.ok === false) {
        const detail =
          body.destinations?.find((entry) => !entry.ok)?.detail ?? body.error ?? "Backup failed";
        toast.error("Backup failed", { description: detail });
      } else {
        toast.success("Snapshot uploaded", { description: body.file ?? "" });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Backup request failed");
    } finally {
      setRunning(false);
    }
  }

  const lastRun = value.lastRun;

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow text-muted-foreground">Control room</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
          Backups &amp; restore
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every night Ashnight writes a full JSON snapshot of the database (and the storage index)
          and uploads it to the accounts below. Keep both destinations on so a single provider
          outage never costs you a restore point.
        </p>
      </header>

      <Card className="border-border/70 bg-panel p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary">
            <HardDriveDownload className="size-4" />
          </span>
          <div className="flex-1">
            <h2 className="font-display text-base font-semibold">Schedule</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The scheduler calls <code>/api/public/hooks/backup</code>. Setup steps live in
              docs/SETUP.md.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <Row
            label="Scheduled backups enabled"
            hint="When off, the nightly job returns without uploading anything."
            checked={draft.enabled}
            onChange={(next) => set("enabled", next)}
          />
          <Row
            label="Include storage index"
            hint="Lists avatar and attachment objects alongside the table data."
            checked={draft.includeStorageIndex}
            onChange={(next) => set("includeStorageIndex", next)}
          />
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="hour">Run hour (UTC)</Label>
            <Input
              id="hour"
              type="number"
              min={0}
              max={23}
              value={draft.scheduleHourUtc}
              onChange={(event) => set("scheduleHourUtc", Number(event.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="keep">Snapshots to keep per destination</Label>
            <Input
              id="keep"
              type="number"
              min={1}
              max={365}
              value={draft.keepCopies}
              onChange={(event) => set("keepCopies", Number(event.target.value))}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => void persist()}>
            <Save className="size-4" /> Save settings
          </Button>
          <Button variant="outline" disabled={running} onClick={() => void runNow()}>
            {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Run backup now
          </Button>
        </div>

        {lastRun ? (
          <div className="mt-5 rounded-lg border border-border/70 bg-background p-4 text-xs">
            <p className="font-medium">
              Last run {new Date(lastRun.at).toLocaleString()} —{" "}
              <span className={lastRun.ok ? "text-success" : "text-destructive"}>
                {lastRun.ok ? "success" : "failed"}
              </span>
            </p>
            <p className="mt-1 text-muted-foreground">
              {lastRun.file} · {(lastRun.bytes / 1024).toFixed(1)} KB · {lastRun.tables} tables
            </p>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {lastRun.destinations.map((entry) => (
                <li key={entry.provider}>
                  {entry.provider}: {entry.ok ? "uploaded" : "failed"} — {entry.detail}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-5 text-xs text-muted-foreground">No backup has run yet.</p>
        )}
      </Card>

      <Card className="border-border/70 bg-panel p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary">
            <CloudUpload className="size-4" />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold">Dropbox account</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a Dropbox app with <code>files.content.write</code> and{" "}
              <code>files.content.read</code>, then paste its credentials and an offline refresh
              token.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <Row
            label="Back up to Dropbox"
            hint="Uploads each snapshot into the folder below."
            checked={draft.dropboxEnabled}
            onChange={(next) => set("dropboxEnabled", next)}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="dropbox-folder">Dropbox folder path</Label>
            <Input
              id="dropbox-folder"
              value={draft.dropboxFolder}
              placeholder="/ashnight-backups"
              onChange={(event) => set("dropboxFolder", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dropbox-account">Account label</Label>
            <Input
              id="dropbox-account"
              value={draft.dropboxAccountLabel}
              placeholder="ops@ashnight.com"
              onChange={(event) => set("dropboxAccountLabel", event.target.value)}
            />
          </div>
        </div>

        <Separator className="my-5" />
        <div className="space-y-3">
          {DROPBOX_KEYS.map((meta) => (
            <KeyField
              key={meta.key}
              label={`Dropbox ${meta.label}`}
              secret={meta.secret}
              current={stored.get(meta.key) ?? ""}
              onSave={async (next) => {
                await upsert.mutateAsync({
                  key: meta.key,
                  value: next,
                  label: `Dropbox ${meta.label}`,
                  is_secret: meta.secret,
                });
                toast.success(`Dropbox ${meta.label} saved`);
              }}
            />
          ))}
        </div>
      </Card>

      <Card className="border-border/70 bg-panel p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary">
            <CloudUpload className="size-4" />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold">Google Drive account</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Create an OAuth client with the <code>drive.file</code> scope, then paste the client
              credentials and an offline refresh token.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <Row
            label="Back up to Google Drive"
            hint="Uploads each snapshot into the folder ID below."
            checked={draft.driveEnabled}
            onChange={(next) => set("driveEnabled", next)}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="drive-folder">Drive folder ID</Label>
            <Input
              id="drive-folder"
              value={draft.driveFolderId}
              placeholder="Leave blank for My Drive root"
              onChange={(event) => set("driveFolderId", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="drive-account">Account label</Label>
            <Input
              id="drive-account"
              value={draft.driveAccountLabel}
              placeholder="backups@ashnight.com"
              onChange={(event) => set("driveAccountLabel", event.target.value)}
            />
          </div>
        </div>

        <Separator className="my-5" />
        <div className="space-y-3">
          {DRIVE_KEYS.map((meta) => (
            <KeyField
              key={meta.key}
              label={`Google Drive ${meta.label}`}
              secret={meta.secret}
              current={stored.get(meta.key) ?? ""}
              onSave={async (next) => {
                await upsert.mutateAsync({
                  key: meta.key,
                  value: next,
                  label: `Google Drive ${meta.label}`,
                  is_secret: meta.secret,
                });
                toast.success(`Google Drive ${meta.label} saved`);
              }}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

function Row({
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
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border/70 bg-background p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function KeyField({
  label,
  secret,
  current,
  onSave,
}: {
  label: string;
  secret: boolean;
  current: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-lg border border-border/70 bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-sm">{label}</Label>
        <span className="text-xs text-muted-foreground">
          {current ? (secret ? maskValue(current) : current) : "not set"}
        </span>
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          type={secret ? "password" : "text"}
          value={value}
          placeholder={current ? "Enter a new value to replace" : "Paste value"}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button
          variant="outline"
          disabled={busy || !value.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(value.trim());
              setValue("");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not save that value");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}
        </Button>
      </div>
    </div>
  );
}
