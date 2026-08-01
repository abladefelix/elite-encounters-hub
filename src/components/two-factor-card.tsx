/**
 * Optional two-factor authentication card. Used on the member profile page and
 * in the control room so both audiences enrol through the same flow.
 */
import { useState } from "react";
import { KeyRound, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useTwoFactor } from "@/lib/two-factor";
import { cn } from "@/lib/utils";

export function TwoFactorCard({
  className,
  required = false,
  available = true,
}: {
  className?: string;
  /** Policy says this account must enrol. */
  required?: boolean;
  /** Admin has 2FA switched on platform-wide. */
  available?: boolean;
}) {
  const {
    factors,
    enrolled,
    loading,
    busy,
    draft,
    startEnrolment,
    confirmEnrolment,
    cancelEnrolment,
    disable,
  } = useTwoFactor();
  const [code, setCode] = useState("");

  async function begin() {
    try {
      await startEnrolment();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start enrolment");
    }
  }

  async function confirm() {
    try {
      await confirmEnrolment(code);
      setCode("");
      toast.success("Two-factor authentication is on");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That code didn't match");
    }
  }

  async function turnOff(factorId: string) {
    try {
      await disable(factorId);
      toast("Two-factor authentication removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove 2FA");
    }
  }

  return (
    <Card className={cn("border-border/70 bg-panel p-5 sm:p-6", className)}>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-foreground">
          {enrolled ? <ShieldCheck className="size-4 text-accent" /> : <KeyRound className="size-4" />}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-semibold">Two-factor authentication</h2>
            {enrolled ? (
              <Badge className="bg-accent/15 text-accent">On</Badge>
            ) : required ? (
              <Badge variant="destructive">Required</Badge>
            ) : (
              <Badge variant="secondary">Optional</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a six-digit code from an authenticator app on top of your password. Ashnight never
            sends codes by SMS.
          </p>
        </div>
      </div>

      {!available && !enrolled ? (
        <p className="mt-4 rounded-lg border border-border bg-surface p-3 text-xs text-muted-foreground">
          Two-factor authentication is currently switched off platform-wide by Ashnight.
        </p>
      ) : loading ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Checking your security settings…
        </p>
      ) : draft ? (
        <div className="mt-5 space-y-4">
          <Separator />
          <div className="flex flex-col gap-4 sm:flex-row">
            <img
              src={draft.qrCode}
              alt="Two-factor authentication QR code"
              className="size-40 shrink-0 rounded-lg border border-border bg-white p-2"
            />
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-xs text-muted-foreground">
                Scan this with Google Authenticator, 1Password, Authy or similar. Can't scan? Enter
                this setup key manually:
              </p>
              <code className="block break-all rounded-lg border border-border bg-surface px-3 py-2 text-xs">
                {draft.secret}
              </code>
              <div className="space-y-1.5">
                <Label htmlFor="totp-code">Six-digit code</Label>
                <Input
                  id="totp-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  placeholder="123456"
                  className="max-w-40 tracking-[0.3em]"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="brass"
                  size="sm"
                  disabled={code.length !== 6 || busy}
                  onClick={() => void confirm()}
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : null} Turn on 2FA
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void cancelEnrolment()}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : enrolled ? (
        <div className="mt-5 space-y-3">
          {factors
            .filter((factor) => factor.status === "verified")
            .map((factor) => (
              <div
                key={factor.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
              >
                <ShieldCheck className="size-4 shrink-0 text-accent" />
                <p className="min-w-0 flex-1 truncate text-sm">{factor.friendlyName}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={busy || required}
                  onClick={() => void turnOff(factor.id)}
                >
                  <ShieldOff className="size-3.5" /> Remove
                </Button>
              </div>
            ))}
          {required ? (
            <p className="text-xs text-muted-foreground">
              Ashnight policy requires 2FA on your account, so it can't be removed.
            </p>
          ) : null}
        </div>
      ) : (
        <Button variant="soft" size="sm" className="mt-5" disabled={busy} onClick={() => void begin()}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
          Set up authenticator app
        </Button>
      )}
    </Card>
  );
}
