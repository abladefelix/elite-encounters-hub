/**
 * Live upload rows: a progress bar while bytes move, a clear message plus a
 * Retry button when one fails, and Cancel while it is still going.
 */
import { AlertTriangle, CheckCircle2, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { UploadTask } from "@/hooks/use-upload-queue";
import { cn } from "@/lib/utils";

function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadProgressList({
  tasks,
  onRetry,
  onCancel,
  onDismiss,
  className,
}: {
  tasks: UploadTask[];
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
  className?: string;
}) {
  if (!tasks.length) return null;

  return (
    <ul className={cn("space-y-2", className)} aria-live="polite">
      {tasks.map((task) => (
        <li
          key={task.id}
          className={cn(
            "rounded-xl border p-3 text-sm",
            task.status === "error"
              ? "border-destructive/50 bg-destructive/5"
              : "border-border/70 bg-surface",
          )}
        >
          <div className="flex items-center gap-2">
            {task.status === "done" ? (
              <CheckCircle2 className="size-4 shrink-0 text-primary" />
            ) : task.status === "error" ? (
              <AlertTriangle className="size-4 shrink-0 text-destructive" />
            ) : null}
            <span className="min-w-0 flex-1 truncate font-medium">{task.name}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {task.status === "uploading"
                ? `${task.progress}% of ${sizeLabel(task.size)}`
                : task.status === "done"
                  ? "Uploaded"
                  : "Failed"}
            </span>
            {task.status === "uploading" ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-label={`Cancel upload of ${task.name}`}
                onClick={() => onCancel(task.id)}
              >
                <X className="size-4" />
              </Button>
            ) : null}
          </div>

          {task.status === "uploading" ? (
            <Progress value={task.progress} className="mt-2 h-1.5" />
          ) : null}

          {task.status === "error" ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-xs text-muted-foreground">{task.error}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => onRetry(task.id)}>
                <RotateCcw className="size-3.5" /> Retry
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => onDismiss(task.id)}>
                Discard
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
