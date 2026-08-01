/**
 * Guard around irreversible admin actions (populating or wiping demo data).
 *
 * The admin must read the warning, type the confirmation phrase, and then pass
 * a second factor: a six-digit code from their authenticator app when 2FA is
 * enrolled, or their account password when it is not.
 */
import { useState } from "react";
import { Loader2, ShieldCheck, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { challengeAndVerify, useTwoFactor } from "@/lib/two-factor";

export interface DangerConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  warning: string;
  bullets?: string[];
  /** Phrase the admin must type exactly. */
  phrase: string;
  confirmLabel: string;
  destructive?: boolean;
  /** Runs only after the phrase and second factor both check out. */
  onConfirm: () => Promise<unknown>;
}

export function DangerConfirmDialog({
  open,
  onOpenChange,
  title,
  warning,
  bullets = [],
  phrase,
  confirmLabel,
  destructive = false,
  onConfirm,
}: DangerConfirmProps) {
  const { factors, enrolled, loading: mfaLoading } = useTwoFactor();
  const [typed, setTyped] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const verifiedFactor = factors.find((factor) => factor.status === "verified");
  const phraseOk = typed.trim().toUpperCase() === phrase.toUpperCase();
  const secondFactorOk = enrolled ? code.trim().length >= 6 : password.length >= 6;

  function reset() {
    setTyped("");
    setCode("");
    setPassword("");
    setError(null);
  }

  async function verifySecondFactor() {
    if (enrolled && verifiedFactor) {
      await challengeAndVerify(verifiedFactor.id, code);
      return;
    }
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email;
    if (!email) throw new Error("Your session expired — sign in again.");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error("That password is not correct.");
  }

  async function run() {
    setError(null);
    setBusy(true);
    try {
      await verifySecondFactor();
      await onConfirm();
      reset();
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not verify that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="size-4 text-amber-500" /> {title}
          </DialogTitle>
          <DialogDescription>{warning}</DialogDescription>
        </DialogHeader>

        {bullets.length ? (
          <ul className="space-y-1.5 rounded-lg border border-border bg-surface p-3 text-sm text-muted-foreground">
            {bullets.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
                {item}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="danger-phrase">
              Type <span className="font-mono font-semibold">{phrase}</span> to continue
            </Label>
            <Input
              id="danger-phrase"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={phrase}
              autoComplete="off"
            />
          </div>

          {mfaLoading ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Checking your second factor…
            </p>
          ) : enrolled ? (
            <div className="space-y-1.5">
              <Label htmlFor="danger-code" className="flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-primary" /> Authenticator code
              </Label>
              <Input
                id="danger-code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                placeholder="123456"
                autoComplete="one-time-code"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="danger-password">Confirm with your account password</Label>
              <Input
                id="danger-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
              <p className="text-xs text-muted-foreground">
                Turn on two-factor authentication in your profile to require an authenticator code
                here instead.
              </p>
            </div>
          )}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={busy || !phraseOk || !secondFactorOk}
            onClick={() => void run()}
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
