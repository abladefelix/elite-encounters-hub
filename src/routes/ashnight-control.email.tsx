/**
 * Control room → Email & domain.
 *
 * Email verification ships OFF. When the sending domain is live, flip the
 * switch here and Ashnight starts refusing sign-ins from unverified addresses.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Copy, Loader2, Mail, MessageCircle, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { AdminAccountCard } from "@/components/admin-account-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useRecordAudit } from "@/lib/audit-log";
import {
  DEFAULT_EMAIL_SETTINGS,
  dnsChecklist,
  fromAddress,
  useEmailSettings,
  type EmailSettings,
} from "@/lib/email-settings";
import { useDeliverySettings } from "@/lib/document-delivery";
import { useIntegrationKeys } from "@/lib/integration-keys";

export const Route = createFileRoute("/ashnight-control/email")({
  head: () => ({
    meta: [
      { title: "Email & Sending Domain | Ashnight Admin" },
      {
        name: "description",
        content:
          "Turn Ashnight email verification on or off, set the sending domain and reply address, and copy the DNS records the domain needs.",
      },
      { property: "og:title", content: "Email & Sending Domain | Ashnight Admin" },
      {
        property: "og:description",
        content: "Verification toggle, sender identity and DNS checklist for Ashnight email.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminEmail,
});

function AdminEmail() {
  const { settings, save, loading } = useEmailSettings();
  const recordAudit = useRecordAudit();
  const [draft, setDraft] = useState<EmailSettings>(settings);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading) setDraft(settings);
  }, [loading, settings]);

  function set<K extends keyof EmailSettings>(key: K, value: EmailSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function persist(next: EmailSettings, note: string) {
    setBusy(true);
    try {
      await save(next);
      void recordAudit.mutateAsync({ area: "email", action: "settings_saved", note });
      toast.success("Email settings saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const records = dnsChecklist(draft);
  const sender = fromAddress(draft);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl">Email &amp; domain</h1>
        <p className="text-sm text-muted-foreground">
          Verification is off by default so members can join immediately. Turn it on once your
          sending domain is verified below.
        </p>
      </header>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="icon-box">
                <ShieldCheck className="size-4" />
              </span>
              <h2 className="font-display text-lg">Email verification</h2>
              <Badge variant={draft.requireVerification ? "default" : "secondary"}>
                {draft.requireVerification ? "required" : "off"}
              </Badge>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              When required, a member who hasn&apos;t opened their confirmation link cannot sign in
              and is told to check their inbox. Keep it off until mail is reliably delivered from
              your own domain.
            </p>
          </div>
          <Switch
            checked={draft.requireVerification}
            aria-label="Require email verification"
            onCheckedChange={(checked) => {
              const next = { ...draft, requireVerification: checked };
              setDraft(next);
              void persist(
                next,
                checked ? "email verification required" : "email verification disabled",
              );
            }}
          />
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2">
          <span className="icon-box">
            <Mail className="size-4" />
          </span>
          <div>
            <h2 className="font-display text-lg">Sender identity</h2>
            <p className="text-xs text-muted-foreground">
              {sender ? `Mail goes out as ${draft.senderName} <${sender}>` : "No domain set yet."}
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sender-domain">Sending domain</Label>
            <Input
              id="sender-domain"
              value={draft.senderDomain}
              placeholder="notify.ashnight.com"
              onChange={(event) => set("senderDomain", event.target.value.trim().toLowerCase())}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sender-mailbox">Mailbox</Label>
            <Input
              id="sender-mailbox"
              value={draft.senderMailbox}
              placeholder="no-reply"
              onChange={(event) => set("senderMailbox", event.target.value.trim())}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sender-name">Display name</Label>
            <Input
              id="sender-name"
              value={draft.senderName}
              onChange={(event) => set("senderName", event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reply-to">Reply-to address</Label>
            <Input
              id="reply-to"
              value={draft.replyTo}
              placeholder="support@ashnight.com"
              onChange={(event) => set("replyTo", event.target.value.trim())}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reclaim-hours">Release unverified sign-ups after (hours)</Label>
            <Input
              id="reclaim-hours"
              type="number"
              min={1}
              value={draft.reclaimAfterHours}
              onChange={(event) =>
                set("reclaimAfterHours", Number(event.target.value) || DEFAULT_EMAIL_SETTINGS.reclaimAfterHours)
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="transport">Transport</Label>
            <select
              id="transport"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={draft.transport}
              onChange={(event) => set("transport", event.target.value as EmailSettings["transport"])}
            >
              <option value="platform">Built-in sender</option>
              <option value="smtp">My SMTP server (Server &amp; DNS credentials)</option>
            </select>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {(
            [
              ["welcomeEmail", "Welcome email on approval"],
              ["receiptEmail", "Email receipts and invoices"],
              ["complaintEmail", "Email complaint updates"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-4 text-sm">
              <span>{label}</span>
              <Switch
                checked={draft[key]}
                aria-label={label}
                onCheckedChange={(checked) => set(key, checked)}
              />
            </div>
          ))}
        </div>

        <Button
          size="sm"
          className="mt-4"
          disabled={busy}
          onClick={() => void persist(draft, "sender identity updated")}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save
          email settings
        </Button>
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-lg">DNS records for {draft.senderDomain || "your domain"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add these at your DNS provider, then verify the domain with your mail provider. Copy each
          value with the button on its row.
        </p>
        <div className="mt-4 space-y-3">
          {records.map((record) => (
            <div key={`${record.type}-${record.name}`} className="rounded-lg border p-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{record.type}</Badge>
                <code className="text-xs">{record.name}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => {
                    void navigator.clipboard.writeText(record.value);
                    toast.success("Copied.");
                  }}
                >
                  <Copy className="size-3.5" /> Copy
                </Button>
              </div>
              <code className="mt-2 block break-all text-xs text-muted-foreground">
                {record.value}
              </code>
              <p className="mt-1 text-xs text-muted-foreground">{record.note}</p>
            </div>
          ))}
        </div>
      </Card>

      <WhatsAppDeliveryCard />

      <AdminAccountCard />
    </div>
  );
}

/** Control room card for the WhatsApp channel members can pick in their profile. */
function WhatsAppDeliveryCard() {
  const { value, save, loading } = useDeliverySettings();
  const keys = useIntegrationKeys();
  const [busy, setBusy] = useState(false);

  const rows = keys.data ?? [];
  const hasPhoneId = rows.some((row) => row.key === "whatsapp_phone_number_id" && row.value);
  const hasToken = rows.some((row) => row.key === "whatsapp_access_token" && row.value);
  const ready = hasPhoneId && hasToken;

  async function update(patch: Partial<typeof value>) {
    setBusy(true);
    try {
      await save({ ...value, ...patch });
      toast.success("Delivery settings saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <span className="icon-box">
          <MessageCircle className="size-4" />
        </span>
        <div>
          <h2 className="font-display text-lg">Invoice &amp; receipt delivery</h2>
          <p className="text-xs text-muted-foreground">
            Members choose email, WhatsApp or both for invoices and receipts on their profile. Only
            the channels you switch on here are offered to them.
          </p>
        </div>
        <Badge className="ml-auto" variant={value.enabled ? "default" : "secondary"}>
          {value.enabled ? "on" : "off"}
        </Badge>
      </div>

      <div className="mt-4 space-y-4">
        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Send paperwork outside the app</p>
            <p className="text-xs text-muted-foreground">
              Master switch. When off, invoices and receipts stay in the member&apos;s Billing tab
              only and nothing is emailed or messaged.
            </p>
          </div>
          <Switch
            checked={value.enabled}
            disabled={loading || busy}
            aria-label="Enable document delivery"
            onCheckedChange={(checked) => void update({ enabled: checked })}
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Email channel</p>
            <p className="text-xs text-muted-foreground">
              Sends from the verified sender domain above. Needs the domain set up before mail can
              leave.
            </p>
          </div>
          <Switch
            checked={value.emailEnabled}
            disabled={loading || busy || !value.enabled}
            aria-label="Enable email delivery"
            onCheckedChange={(checked) => void update({ emailEnabled: checked })}
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">WhatsApp channel</p>
              <Badge variant={ready ? "default" : "secondary"}>
                {ready ? "credentials set" : "credentials missing"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Uses the WhatsApp Cloud API credentials in Settings → Integration vault
              (whatsapp_phone_number_id and whatsapp_access_token).
            </p>
          </div>
          <Switch
            checked={value.whatsappEnabled}
            disabled={loading || busy || !value.enabled}
            aria-label="Enable WhatsApp delivery"
            onCheckedChange={(checked) => void update({ whatsappEnabled: checked })}
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Fall back to email</p>
            <p className="text-xs text-muted-foreground">
              If a WhatsApp send is not possible, email the document instead so the member always
              gets it.
            </p>
          </div>
          <Switch
            checked={value.whatsappFallbackToEmail}
            disabled={loading || busy || !value.enabled}
            aria-label="Fall back to email"
            onCheckedChange={(checked) => void update({ whatsappFallbackToEmail: checked })}
          />
        </div>

        <div>
          <Label htmlFor="whatsapp-sender">Sender name in the message</Label>
          <Input
            id="whatsapp-sender"
            className="mt-2"
            value={value.whatsappSenderName}
            disabled={loading || busy}
            onChange={(event) => void update({ whatsappSenderName: event.target.value })}
          />
        </div>

        {!ready ? (
          <p className="text-xs text-muted-foreground">
            Add the WhatsApp Cloud API phone number ID and access token in the integration vault to
            start sending. Until then WhatsApp choices fall back to email.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

