import { useState } from "react";
import { Flag, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { REPORT_REASONS, type ReportReason } from "@/lib/reports";
import { cn } from "@/lib/utils";
import type { Specialist } from "@/lib/types";

export interface ReportDraft {
  reason: ReportReason;
  details: string;
  blocked: boolean;
}

/** Lets a member report the other person in a thread to Ashnight trust & safety. */
export function ReportDialog({
  specialist,
  open,
  onOpenChange,
  onSubmit,
}: {
  specialist: Specialist;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: ReportDraft) => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [blocked, setBlocked] = useState(false);

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setReason(null);
      setDetails("");
      setBlocked(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Flag className="size-4 text-destructive" /> Report {specialist.name.split(" ")[0]}
          </DialogTitle>
          <DialogDescription>
            Ashnight trust &amp; safety reviews every report with the thread attached. Nothing is
            shared with the other member.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {REPORT_REASONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setReason(item.id)}
              className={cn(
                "w-full rounded-lg border p-3 text-left transition-colors",
                reason === item.id
                  ? "border-primary/60 bg-primary/10"
                  : "border-border/70 bg-background/50 hover:bg-secondary/60",
              )}
            >
              <p className="text-sm font-medium">{item.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.hint}</p>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="report-details">What happened?</Label>
          <Textarea
            id="report-details"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Add anything that helps us review — dates, message times, booking reference."
            maxLength={800}
            rows={3}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/50 p-3">
          <div className="pr-3">
            <p className="text-sm font-medium">Also block this member</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Hides the thread and stops new messages while we review.
            </p>
          </div>
          <Switch checked={blocked} onCheckedChange={setBlocked} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!reason}
            onClick={() => {
              if (!reason) return;
              onSubmit({ reason, details: details.trim(), blocked });
              close(false);
            }}
          >
            <ShieldAlert className="size-4" /> Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
