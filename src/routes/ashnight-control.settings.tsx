import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, KeyRound, Loader2, Plus, RotateCcw, Save, ScrollText, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { TwoFactorCard } from "@/components/two-factor-card";
import { useAuditLog } from "@/lib/audit-log";
import { useRecordAudit } from "@/lib/audit-log";
import { useFeatureFlags } from "@/lib/feature-flags";
import {
  EXPECTED_KEYS,
  maskValue,
  useIntegrationKeyMutations,
  useIntegrationKeys,
  type IntegrationKeyRow,
} from "@/lib/integration-keys";
import { relativeTime } from "@/lib/escrow";

export const Route = createFileRoute("/ashnight-control/settings")({
  head: () => ({
    meta: [
      { title: "Keys, Security & Audit Log | Ashnight Admin" },
      {
        name: "description",
        content:
          "Rotate Ashnight API keys, enforce two-factor authentication per role and review every admin change from one settings screen.",
      },
      { property: "og:title", content: "Keys, Security & Audit Log | Ashnight Admin" },
      {
        property: "og:description",
        content: "Admin-only key vault, 2FA policy and a full audit trail.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminSettings,
});

function AdminSettings() {
  const keysQuery = useIntegrationKeys();
  const { upsert, remove } = useIntegrationKeyMutations();
  const { flags, setFlag } = useFeatureFlags();
  const auditQuery = useAuditLog(60);
  const recordAudit = useRecordAudit();

  const rows = useMemo(() => {
    const stored = keysQuery.data ?? [];
    const byKey = new Map(stored.map((row) => [row.key, row]));
    const expected = EXPECTED_KEYS.map<IntegrationKeyRow>(
      (meta) =>
        byKey.get(meta.key) ?? {
          id: `new:${meta.key}`,
          key: meta.key,
          label: meta.label,
          description: meta.description,
          value: "",
          is_secret: meta.secret,
          updated_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
    );
    const extras = stored.filter((row) => !EXPECTED_KEYS.some((meta) => meta.key === row.key));
    return [...expected, ...extras];
  }, [keysQuery.data]);

  async function saveKey(row: IntegrationKeyRow, value: string) {
    try {
      await upsert.mutateAsync({
        key: row.key,
        value,
        label: row.label,
        description: row.description,
        is_secret: row.is_secret,
      });
      if (flags.auditLogging) {
        recordAudit.mutate({
          area: "keys",
          action: value ? "rotated" : "cleared",
          target: row.key,
          note: `${row.label} updated`,
        });
      }
      toast.success(`${row.label} saved`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save that key");
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow text-muted-foreground">Control room</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
          Keys, security &amp; audit
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every third-party credential Ashnight uses can be rotated here without a code change.
          Secret values are readable by admins only — members never receive them.
        </p>
      </header>

      <Card className="border-border/70 bg-panel p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary">
            <KeyRound className="size-4" />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold">Integration keys</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Paystack, calling infrastructure and anything you add later. Public keys are published
              to the member app automatically; secret keys stay server-side.
            </p>
          </div>
        </div>

        {keysQuery.isLoading ? (
          <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading the vault…
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {rows.map((row) => (
              <KeyEditor
                key={row.key}
                row={row}
                saving={upsert.isPending}
                onSave={(value) => void saveKey(row, value)}
                onDelete={
                  row.id.startsWith("new:") || EXPECTED_KEYS.some((meta) => meta.key === row.key)
                    ? undefined
                    : () => void remove.mutateAsync(row.id)
                }
              />
            ))}
          </div>
        )}

        <Separator className="my-5" />
        <CustomKeyForm
          onCreate={async (key, label, value, secret) => {
            await upsert.mutateAsync({ key, label, value, is_secret: secret, description: "" });
            toast.success(`${label || key} added`);
          }}
        />
      </Card>

      <Card className="border-border/70 bg-panel p-5 sm:p-6">
        <h2 className="font-display text-base font-semibold">Two-factor policy</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Decide who must use an authenticator app. Members can always opt in voluntarily while 2FA
          is available.
        </p>
        <div className="mt-4 space-y-3">
          <PolicyRow
            label="Offer 2FA to all members"
            hint="Shows the authenticator setup card on every profile."
            checked={flags.twoFactorAvailable}
            onChange={(next) => void setFlag("twoFactorAvailable", next)}
          />
          <PolicyRow
            label="Require 2FA for admins"
            hint="Control-room access is blocked until an admin enrols."
            checked={flags.requireTwoFactorForAdmins}
            onChange={(next) => void setFlag("requireTwoFactorForAdmins", next)}
          />
          <PolicyRow
            label="Require 2FA for specialists"
            hint="Specialists must enrol before taking paid work."
            checked={flags.requireTwoFactorForSpecialists}
            onChange={(next) => void setFlag("requireTwoFactorForSpecialists", next)}
          />
          <PolicyRow
            label="Record admin changes"
            hint="Writes every control-room change to the audit log below."
            checked={flags.auditLogging}
            onChange={(next) => void setFlag("auditLogging", next)}
          />
        </div>
      </Card>

      <TwoFactorCard required={flags.requireTwoFactorForAdmins} available />

      <Card className="border-border/70 bg-panel p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary">
            <ScrollText className="size-4" />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold">Admin audit log</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The most recent {(auditQuery.data ?? []).length} recorded changes.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          {(auditQuery.data ?? []).map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm"
            >
              <Badge variant="secondary" className="uppercase tracking-wide">
                {entry.area}
              </Badge>
              <span className="font-medium">{entry.action}</span>
              {entry.target ? (
                <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">{entry.target}</code>
              ) : null}
              {entry.note ? (
                <span className="text-xs text-muted-foreground">{entry.note}</span>
              ) : null}
              <span className="ml-auto text-xs text-muted-foreground">
                {relativeTime(entry.created_at)}
              </span>
            </div>
          ))}
          {!auditQuery.isLoading && !(auditQuery.data ?? []).length ? (
            <p className="text-xs text-muted-foreground">
              Nothing recorded yet — changes appear here as admins work.
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function PolicyRow({
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
    <div className="flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function KeyEditor({
  row,
  saving,
  onSave,
  onDelete,
}: {
  row: IntegrationKeyRow;
  saving: boolean;
  onSave: (value: string) => void;
  onDelete?: (() => void) | undefined;
}) {
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(false);
  const hasValue = row.value.length > 0;

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{row.label}</p>
        <Badge variant={row.is_secret ? "destructive" : "secondary"} className="text-[10px]">
          {row.is_secret ? "Secret" : "Public"}
        </Badge>
        {hasValue ? (
          <Badge className="bg-accent/15 text-[10px] text-accent">
            <Check className="mr-1 size-3" /> Set
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">
            Not set
          </Badge>
        )}
        <code className="ml-auto text-[10px] text-muted-foreground">{row.key}</code>
      </div>
      {row.description ? (
        <p className="mt-1 text-xs text-muted-foreground">{row.description}</p>
      ) : null}

      {editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={`Paste the new ${row.label.toLowerCase()}`}
            className="min-w-52 flex-1"
            type={row.is_secret ? "password" : "text"}
          />
          <Button
            size="sm"
            variant="brass"
            disabled={saving}
            onClick={() => {
              onSave(value.trim());
              setValue("");
              setEditing(false);
            }}
          >
            <Save className="size-3.5" /> Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-secondary px-2 py-1.5 text-xs">
            {hasValue
              ? row.is_secret
                ? maskValue(row.value)
                : row.value
              : "— nothing stored yet —"}
          </code>
          <Button size="sm" variant="soft" onClick={() => setEditing(true)}>
            <RotateCcw className="size-3.5" /> {hasValue ? "Rotate" : "Add"}
          </Button>
          {hasValue ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onSave("")}
            >
              Clear
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              aria-label={`Delete ${row.label}`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          ) : null}
          <span className="text-[10px] text-muted-foreground">
            {hasValue ? `Updated ${relativeTime(row.updated_at)}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

function CustomKeyForm({
  onCreate,
}: {
  onCreate: (key: string, label: string, value: string, secret: boolean) => Promise<void>;
}) {
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [secret, setSecret] = useState(true);

  const slug = key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");

  return (
    <div className="rounded-lg border border-dashed border-border bg-surface/60 p-3">
      <p className="text-sm font-medium">Add another key</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Anything a future integration needs — SMS, maps, analytics, AI providers.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="new-key-name">Key name</Label>
          <Input
            id="new-key-name"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="twilio_auth_token"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-key-label">Label</Label>
          <Input
            id="new-key-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Twilio auth token"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="new-key-value">Value</Label>
          <Input
            id="new-key-value"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            type={secret ? "password" : "text"}
            placeholder="Paste the credential"
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Switch
            id="new-key-secret"
            checked={secret}
            onCheckedChange={setSecret}
            aria-label="Secret key"
          />
          <Label htmlFor="new-key-secret" className="text-xs text-muted-foreground">
            Secret (never sent to members)
          </Label>
        </div>
        <Button
          size="sm"
          variant="soft"
          className="ml-auto"
          disabled={!slug}
          onClick={() => {
            void onCreate(slug, label.trim() || slug, value.trim(), secret).then(() => {
              setKey("");
              setLabel("");
              setValue("");
            });
          }}
        >
          <Plus className="size-3.5" /> Add key
        </Button>
      </div>
    </div>
  );
}
