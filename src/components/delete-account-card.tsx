/**
 * Danger-zone card: lets a member permanently delete their own account after a
 * clear warning and a typed confirmation.
 */
import { useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/lib/account-deletion.functions";

export function DeleteAccountCard({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (typed.trim().toUpperCase() !== "DELETE") {
      toast.error('Type DELETE to confirm.');
      return;
    }
    setBusy(true);
    try {
      await deleteMyAccount({ data: { confirm: "DELETE" } });
      await supabase.auth.signOut();
      toast.success("Your Ashnight account has been deleted.");
      window.location.assign("/");
    } catch (error) {
      setBusy(false);
      toast.error(error instanceof Error ? error.message : "Could not delete the account.");
    }
  }

  return (
    <Card className={`border-destructive/40 bg-panel p-5 sm:p-6 ${className ?? ""}`}>
      <div className="flex items-start gap-3">
        <span className="icon-box border-destructive/40 text-destructive">
          <AlertTriangle className="size-4" />
        </span>
        <div>
          <h2 className="font-display text-base font-semibold">Delete account</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            This permanently removes your profile, photos, chats, bookings and history. It cannot be
            undone, and any pending escrow or wallet balance is forfeited. Settle open services and
            withdraw your balance first.
          </p>
        </div>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setTyped("");
        }}
      >
        <DialogTrigger asChild>
          <Button variant="destructive" className="mt-4" size="sm">
            <Trash2 className="size-4" /> Delete my account
          </Button>
        </DialogTrigger>
        <DialogContent className="rounded-md sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              You will lose access immediately. Your bookings, messages, gifts, ratings and any
              money held in escrow or your wallet are gone for good. We cannot restore them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-confirm">Type DELETE to confirm</Label>
            <Input
              id="delete-confirm"
              value={typed}
              autoComplete="off"
              placeholder="DELETE"
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              Keep my account
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy || typed.trim().toUpperCase() !== "DELETE"}
              onClick={() => void remove()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}{" "}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
