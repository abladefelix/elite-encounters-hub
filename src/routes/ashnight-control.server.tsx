import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  Globe,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Server,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { CredentialRow } from "@/components/credential-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRecordAudit } from "@/lib/audit-log";
import {
  DNS_RECORD_TYPES,
  newDnsRecord,
  starterRecords,
  useDnsRecords,
  type DnsRecord,
  type DnsRecordType,
} from "@/lib/dns-records";
import { useFeatureFlags } from "@/lib/feature-flags";
import { CREDENTIAL_GROUPS, CREDENTIAL_KEYS } from "@/lib/hosting-credentials";
import { useIntegrationKeyMutations, useIntegrationKeys } from "@/lib/integration-keys";
import { getServerIdentity } from "@/lib/server-identity.functions";

export const Route = createFileRoute("/ashnight-control/server")({
  head: () => ({
    meta: [
      { title: "Server, DNS & Credentials | Ashnight Admin" },
      {
        name: "description",
        content:
          "Read the public IP of the host running Ashnight, copy the DNS records your domain needs and store database, server and mail credentials in the admin vault.",
      },
      { property: "og:title", content: "Server, DNS & Credentials | Ashnight Admin" },
      {
        property: "og:description",
        content: "Public IP detection, DNS record sheet and an admin-only credential vault.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminServer,
});

function copy(value: string, label: string) {
  void navigator.clipboard.writeText(value).then(
    () => toast.success(`${label} copied`),
    () => toast.error("Could not copy that"),
  );
}

function AdminServer() {
  const keysQuery = useIntegrationKeys();
  const { upsert } = useIntegrationKeyMutations();
  const { flags } = useFeatureFlags();
  const recordAudit = useRecordAudit();

  const identity = useQuery({
    queryKey: ["server-identity"],
    queryFn: () => getServerIdentity(),
    staleTime: 5 * 60 * 1000,
  });

  const values = useMemo(() => {
    const map = new Map((keysQuery.data ?? []).map((row) => [row.key, row.value]));
    return (key: string) => map.get(key) ?? "";
  }, [keysQuery.data]);

  const detectedIp = identity.data?.ipv4 ?? null;
  const overrideIp = values("server_public_ip_override");
  const effectiveIp = overrideIp || detectedIp || "";
  const domain = values("primary_domain") || "yourdomain.com";

  async function saveCredential(key: string, label: string, secret: boolean, value: string) {
    const meta = CREDENTIAL_KEYS.find((field) => field.key === key);
    try {
      await upsert.mutateAsync({
        key,
        value,
        label,
        description: meta?.description ?? "",
        is_secret: secret,
      });
      if (flags.auditLogging) {
        recordAudit.mutate({
          area: "hosting",
          action: value ? "updated" : "cleared",
          target: key,
          note: `${label} updated`,
        });
      }
      toast.success(`${label} saved`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save that value");
    }
  }




  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow text-muted-foreground">Control room</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
          Server, DNS &amp; credentials
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Wherever Ashnight is hosted, this screen reports the public IP the outside world sees, the
          exact DNS records your domain needs, and keeps every hosting login in the admin-only
          vault.
        </p>
      </header>

      <Card className="border-border/70 bg-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary">
            <Server className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-semibold">This host</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Detected from the server itself, so it is the address DNS should target — not your own
              connection.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={identity.isFetching}
            onClick={() => void identity.refetch()}
          >
            {identity.isFetching ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Re-check
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Fact
            label="Public IPv4"
            value={detectedIp ?? (identity.isLoading ? "Checking…" : "Unavailable")}
            onCopy={detectedIp ? () => copy(detectedIp, "IPv4") : undefined}
          />
          <Fact
            label="Public IPv6"
            value={identity.data?.ipv6 ?? "None"}
            onCopy={
              identity.data?.ipv6 ? () => copy(identity.data.ipv6 as string, "IPv6") : undefined
            }
          />
          <Fact label="Request hostname" value={identity.data?.host ?? "—"} />
          <Fact
            label="Effective IP for DNS"
            value={effectiveIp || "—"}
            hint={overrideIp ? "Using your override" : identity.data?.source ? `via ${identity.data.source}` : ""}
            onCopy={effectiveIp ? () => copy(effectiveIp, "IP") : undefined}
          />
        </div>

        {identity.error ? (
          <p className="mt-4 text-xs text-destructive">
            {identity.error instanceof Error ? identity.error.message : "Lookup failed"}
          </p>
        ) : identity.data?.error ? (
          <p className="mt-4 text-xs text-muted-foreground">
            {identity.data.error} Set a public IP override below and the DNS sheet will use it.
          </p>
        ) : null}
      </Card>

      <DnsRecordsCard ip={effectiveIp} domain={domain} />


      <Card className="border-border/70 bg-panel p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary">
            <KeyRound className="size-4" />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold">Hosting credential vault</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Database, server, hosting-panel and mail logins. Stored in the admin-only vault —
              members never receive these values.
            </p>
          </div>
        </div>

        {keysQuery.isLoading ? (
          <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading the vault…
          </p>
        ) : (
          <div className="mt-5 space-y-6">
            {CREDENTIAL_GROUPS.map((group) => (
              <section key={group.id}>
                <h3 className="text-sm font-semibold">{group.title}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{group.blurb}</p>
                <div className="mt-3 space-y-2">
                  {group.fields.map((field) => (
                    <CredentialRow
                      key={field.key}
                      label={field.label}
                      description={field.description}
                      storageKey={field.key}
                      value={values(field.key)}
                      secret={field.secret}
                      saving={upsert.isPending}
                      onSave={(next) =>
                        void saveCredential(field.key, field.label, field.secret, next)
                      }
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Fact({
  label,
  value,
  hint,
  onCopy,
}: {
  label: string;
  value: string;
  hint?: string;
  onCopy?: (() => void) | undefined;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate font-mono text-sm">{value}</code>
        {onCopy ? (
          <Button size="sm" variant="ghost" onClick={onCopy}>
            <Copy className="size-3.5" />
          </Button>
        ) : null}
      </div>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Editable DNS record sheet.
 *
 * The admin types the exact values their registrar and mail provider give them;
 * "Prefill starter set" only offers a first draft based on the detected IP.
 */
function DnsRecordsCard({ ip, domain }: { ip: string; domain: string }) {
  const { records, replace, loading } = useDnsRecords();
  // Edited locally and saved on demand: writing on every keystroke raced the
  // realtime refresh and dropped characters.
  const [draft, setDraft] = useState<DnsRecord[]>(records);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(records), [records]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(records);

  function update(id: string, patch: Partial<DnsRecord>) {
    setDraft((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function persist(next: DnsRecord[]) {
    setSaving(true);
    try {
      await replace(next);
      setDraft(next);
      toast.success("DNS records saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the DNS records");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-border/70 bg-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary">
          <Globe className="size-4" />
        </span>
        <div className="min-w-[16rem] flex-1">
          <h2 className="font-display text-base font-semibold">DNS records</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the records your registrar and mail provider require. They are saved for the whole
            team and copied straight into your DNS panel.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {draft.length === 0 ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void persist(starterRecords(ip, domain))}
            >
              <Sparkles className="mr-2 size-3.5" /> Prefill starter set
            </Button>
          ) : null}
          <Button size="sm" onClick={() => setDraft((prev) => [...prev, newDnsRecord()])}>
            <Plus className="mr-2 size-3.5" /> Add record
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading records…
        </p>
      ) : draft.length === 0 ? (
        <p className="mt-5 rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
          No records yet. Add them one by one, or prefill a starter set
          {ip ? ` pointing at ${ip}` : ""} and edit from there.
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {draft.map((row) => (
            <div key={row.id} className="rounded-xl border border-border bg-surface p-3">
              <div className="grid gap-3 sm:grid-cols-12">
                <div className="sm:col-span-2">
                  <Label className="text-[11px] text-muted-foreground">Type</Label>
                  <Select
                    value={row.type}
                    onValueChange={(value) => update(row.id, { type: value as DnsRecordType })}
                  >
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DNS_RECORD_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-3">
                  <Label className="text-[11px] text-muted-foreground">Host / name</Label>
                  <Input
                    className="mt-1 h-9 font-mono text-xs"
                    value={row.name}
                    placeholder="@"
                    onChange={(event) => update(row.id, { name: event.target.value })}
                  />
                </div>
                <div className="sm:col-span-5">
                  <Label className="text-[11px] text-muted-foreground">Value</Label>
                  <Input
                    className="mt-1 h-9 font-mono text-xs"
                    value={row.value}
                    placeholder={row.type === "A" ? ip || "203.0.113.10" : "target or text value"}
                    onChange={(event) => update(row.id, { value: event.target.value })}
                  />
                </div>
                <div className="sm:col-span-1">
                  <Label className="text-[11px] text-muted-foreground">TTL</Label>
                  <Input
                    className="mt-1 h-9 text-xs"
                    value={row.ttl}
                    inputMode="numeric"
                    onChange={(event) => update(row.id, { ttl: event.target.value })}
                  />
                </div>
                <div className="sm:col-span-1">
                  <Label className="text-[11px] text-muted-foreground">Prio</Label>
                  <Input
                    className="mt-1 h-9 text-xs"
                    value={row.priority}
                    inputMode="numeric"
                    disabled={row.type !== "MX" && row.type !== "SRV"}
                    onChange={(event) => update(row.id, { priority: event.target.value })}
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="min-w-[12rem] flex-1">
                  <Label className="text-[11px] text-muted-foreground">Note</Label>
                  <Input
                    className="mt-1 h-9 text-xs"
                    value={row.note}
                    placeholder="What this record is for"
                    onChange={(event) => update(row.id, { note: event.target.value })}
                  />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copy(row.value, `${row.type} value`)}
                >
                  <Copy className="mr-2 size-3.5" /> Copy
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDraft((prev) => prev.filter((item) => item.id !== row.id))}
                >
                  <Trash2 className="mr-2 size-3.5" /> Remove
                </Button>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={saving || !dirty} onClick={() => void persist(draft)}>
              {saving ? (
                <Loader2 className="mr-2 size-3.5 animate-spin" />
              ) : (
                <Save className="mr-2 size-3.5" />
              )}
              Save records
            </Button>
            {dirty ? (
              <Button size="sm" variant="ghost" onClick={() => setDraft(records)}>
                Discard changes
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">All changes saved.</span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
