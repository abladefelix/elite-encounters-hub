/**
 * Dry-run preview for site-wide wording rules.
 *
 * Opens before the admin saves, walks every page of the site off-screen and
 * lists the exact sentences each rule would rewrite, page by page — so a rule
 * is never saved blind.
 */
import { useState } from "react";
import { AlertTriangle, ArrowRight, Check, Loader2, Save, ScanSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PhraseRule } from "@/lib/phrase-overrides";
import { previewWordingRules, type PreviewPage } from "@/lib/wording-preview";

export function WordingPreviewDialog({
  open,
  onOpenChange,
  rules,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: PhraseRule[];
  busy: boolean;
  onConfirm: () => void;
}) {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(
    null,
  );
  const [pages, setPages] = useState<PreviewPage[] | null>(null);

  const active = rules.filter((rule) => rule.enabled && rule.find.trim().length > 0);

  async function run() {
    setScanning(true);
    setPages(null);
    try {
      const result = await previewWordingRules(active, {
        onProgress: (done, total, label) => setProgress({ done, total, label }),
      });
      setPages(result);
    } finally {
      setScanning(false);
      setProgress(null);
    }
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (next) {
      void run();
    } else {
      setPages(null);
    }
  }

  const withChanges = (pages ?? []).filter((page) => page.changes.length > 0);
  const totalChanges = withChanges.reduce((sum, page) => sum + page.changes.length, 0);
  const failures = (pages ?? []).filter((page) => page.error);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl" data-no-reword>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanSearch className="size-4" /> Preview wording changes
          </DialogTitle>
          <DialogDescription>
            A dry run across every page of the site. Nothing is saved until you confirm.
          </DialogDescription>
        </DialogHeader>

        {active.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
            No live rules to preview. Add a rule with wording to find, and switch it on.
          </p>
        ) : scanning ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Checking {progress ? `${progress.label} (${progress.done + 1} of ${progress.total})` : "pages"}…
          </p>
        ) : pages === null ? (
          <p className="py-6 text-sm text-muted-foreground">Preparing the preview…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-border/70 bg-secondary/60 px-2 py-0.5">
                {totalChanges} string{totalChanges === 1 ? "" : "s"} affected
              </span>
              <span className="rounded-full border border-border/70 bg-secondary/60 px-2 py-0.5">
                {withChanges.length} page{withChanges.length === 1 ? "" : "s"} changed
              </span>
              {failures.length > 0 ? (
                <span className="flex items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-muted-foreground">
                  <AlertTriangle className="size-3" /> {failures.length} page
                  {failures.length === 1 ? "" : "s"} unreadable
                </span>
              ) : null}
            </div>

            <ScrollArea className="mt-3 max-h-[52vh] pr-3">
              {withChanges.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                  No visible copy on the scanned pages matches these rules. Pages behind extra steps
                  (open chats, dialogs) aren’t walked, so a rule may still apply there.
                </p>
              ) : (
                <div className="space-y-4">
                  {withChanges.map((page) => (
                    <section key={page.path}>
                      <h3 className="text-sm font-semibold">
                        {page.label}{" "}
                        <span className="font-normal text-muted-foreground">{page.path}</span>
                      </h3>
                      <ul className="mt-2 space-y-1.5">
                        {page.changes.map((change, index) => (
                          <li
                            key={`${page.path}-${index}`}
                            className="rounded-md border border-border/70 bg-background/40 p-2 text-xs"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-destructive line-through">{change.before}</span>
                              <ArrowRight className="size-3 text-muted-foreground" />
                              <span className="font-medium text-foreground">{change.after}</span>
                            </div>
                            <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                              {change.kind === "text" ? "on-page text" : change.kind} · {change.where}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </ScrollArea>
          </>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" disabled={scanning} onClick={() => void run()}>
            <ScanSearch className="mr-2 size-3.5" /> Re-scan
          </Button>
          <Button size="sm" disabled={busy || scanning} onClick={onConfirm}>
            {busy ? (
              <Loader2 className="mr-2 size-3.5 animate-spin" />
            ) : totalChanges > 0 ? (
              <Save className="mr-2 size-3.5" />
            ) : (
              <Check className="mr-2 size-3.5" />
            )}
            Save these rules
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
