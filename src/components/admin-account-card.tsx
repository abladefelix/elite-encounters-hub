/**
 * Lets an admin change the email address and password of the account they are
 * signed in with — so the shipped default credentials never stay in place.
 */
import { useState } from "react";
import { KeyRound, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useRecordAudit } from "@/lib/audit-log";
import { endMySessionsAfterPasswordChange } from "@/lib/session-management.functions";

export function AdminAccountCard() {
  const { session } = useAuth();
  const recordAudit = useRecordAudit();
  const [email, setEmail] = useState(session?.user.email ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (password && password.length < 10) {
      toast.error("Use at least 10 characters for an admin password.");
      return;
    }
    if (password && password !== confirm) {
      toast.error("The two passwords don't match.");
      return;
    }
    setBusy(true);
    const payload: { email?: string; password?: string } = {};
    const trimmed = email.trim();
    if (trimmed && trimmed !== session?.user.email) payload.email = trimmed;
    if (password) payload.password = password;
    if (!payload.email && !payload.password) {
      setBusy(false);
      toast.info("Nothing to change.");
      return;
    }
    const { error } = await supabase.auth.updateUser(payload);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (payload.password) {
      await endMySessionsAfterPasswordChange();
      await supabase.auth.signOut();
      window.location.assign("/auth");
      return;
    }
    setPassword("");
    setConfirm("");
    void recordAudit.mutateAsync({
      area: "security",
      action: "admin_credentials_changed",
      target: session?.user.id ?? "",
      note: payload.email ? "email and/or password updated" : "password updated",
    });
    toast.success(
      payload.email
        ? "Saved. Confirm the new address from the link we sent to it."
        : "Admin password updated.",
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <span className="icon-box">
          <KeyRound className="size-4" />
        </span>
        <div>
          <h2 className="font-display text-lg">Admin account</h2>
          <p className="text-xs text-muted-foreground">
            Signed in as {session?.user.email ?? "unknown"} — change the shipped defaults here.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="admin-email">Admin email</Label>
          <Input
            id="admin-email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-password">New password</Label>
          <Input
            id="admin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-password-confirm">Repeat password</Label>
          <Input
            id="admin-password-confirm"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
          />
        </div>
      </div>
      <Button size="sm" className="mt-4" disabled={busy} onClick={() => void save()}>
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save
        credentials
      </Button>
    </Card>
  );
}
