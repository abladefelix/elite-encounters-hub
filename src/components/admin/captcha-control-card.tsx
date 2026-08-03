/**
 * Admin control for the sign-in / sign-up security check (Cloudflare Turnstile).
 *
 * One card owns the whole switch: the on/off toggle, whether the two Turnstile
 * keys are in place, and the inputs to save them. The challenge is only live
 * when the toggle is on *and* both keys exist, so this card always states
 * plainly what members are currently seeing.
 */
import { useState } from "react";
import { KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useIntegrationKeys, useIntegrationKeyMutations, maskValue } from "@/lib/integration-keys";

export function CaptchaControlCard({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  const keys = useIntegrationKeys();
  const { upsert } = useIntegrationKeyMutations();
  const [siteDraft, setSiteDraft] = useState("");
  const [secretDraft, setSecretDraft] = useState("");

  const row = (key: string) => (keys.data ?? []).find((item) => item.key === key);
  const siteRow = row("turnstile_site_key");
  const secretRow = row("turnstile_secret_key");
  const siteKey = (siteRow?.value ?? "").trim();
  const secretKey = (secretRow?.value ?? "").trim();
  const configured = Boolean(siteKey && secretKey);
  const live = enabled && configured;

  async function save(key: string, value: string, isSecret: boolean, label: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      toast.error("Paste the key first.");
      return;
    }
    try {
      await upsert.mutateAsync({
        key,
        value: trimmed,
        label,
        description:
          key === "turnstile_site_key"
            ? "Cloudflare Turnstile site key — draws the security check on sign-in and sign-up."
            : "Verifies each solved security check on the server. Never leaves the box.",
        is_secret: isSecret,
      });
      if (isSecret) setSecretDraft("");
      else setSiteDraft("");
      toast.success(`${label} saved`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save that key.");
    }
  }

  return (
    <Card className="border-border/70 bg-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary">
          {live ? <ShieldCheck className="size-4" /> : <ShieldOff className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-semibold">Sign-in security check</h2>
            <Badge variant={live ? "default" : "secondary"} className="text-[10px]">
              {live ? "Live" : enabled ? "Waiting for keys" : "Off"}
            </Badge>
          </div>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            {live
              ? "Members solve a Cloudflare Turnstile challenge before sign-in and sign-up. Every token is verified on the server, so the check can't be skipped."
              : enabled
                ? "Switched on, but dormant until both Turnstile keys below are saved — nobody is locked out in the meantime."
                : "Switched off. Sign-in and sign-up accept attempts without a challenge."}
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          aria-label="Sign-in and sign-up security check"
        />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
          <Label htmlFor="turnstile-site" className="flex items-center gap-2 text-xs">
            <KeyRound className="size-3.5" /> Turnstile site key
            {siteKey ? (
              <Badge variant="secondary" className="ml-auto text-[10px]">
                Saved
              </Badge>
            ) : null}
          </Label>
          {siteKey ? (
            <p className="font-mono text-xs text-muted-foreground">{siteKey}</p>
          ) : null}
          <div className="flex gap-2">
            <Input
              id="turnstile-site"
              placeholder="0x4AAAA…"
              value={siteDraft}
              onChange={(event) => setSiteDraft(event.target.value)}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={upsert.isPending}
              onClick={() => void save("turnstile_site_key", siteDraft, false, "Turnstile site key")}
            >
              Save
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Public — drawn in members' browsers.
          </p>
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
          <Label htmlFor="turnstile-secret" className="flex items-center gap-2 text-xs">
            <KeyRound className="size-3.5" /> Turnstile secret key
            {secretKey ? (
              <Badge variant="secondary" className="ml-auto text-[10px]">
                Saved
              </Badge>
            ) : null}
          </Label>
          {secretKey ? (
            <p className="font-mono text-xs text-muted-foreground">{maskValue(secretKey)}</p>
          ) : null}
          <div className="flex gap-2">
            <Input
              id="turnstile-secret"
              type="password"
              placeholder="0x4AAAA…"
              value={secretDraft}
              onChange={(event) => setSecretDraft(event.target.value)}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={upsert.isPending}
              onClick={() =>
                void save("turnstile_secret_key", secretDraft, true, "Turnstile secret key")
              }
            >
              Save
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Server-only — never sent to a member's device.
          </p>
        </div>
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground">
        Create the widget in your Cloudflare dashboard under Turnstile, add this site's domain,
        then paste both keys here. Rejected challenges appear in Control room → Logs as{" "}
        <span className="font-mono">captcha_failed</span>.
      </p>
    </Card>
  );
}
