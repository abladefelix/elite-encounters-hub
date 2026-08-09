import { useState } from "react";
import { History } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useChatHistorySettings } from "@/lib/chat-history";

/**
 * Control-room editor for folding long chat threads. Older messages collapse
 * behind one row so the composer stays reachable; members can always re-list
 * the full history with a tap.
 */
export function ChatHistoryCard() {
  const { settings, saveSettings, loading } = useChatHistorySettings();
  const [hours, setHours] = useState(String(settings.foldAfterHours));
  const [keep, setKeep] = useState(String(settings.keepRecent));
  const [dirtyKey, setDirtyKey] = useState<string | null>(null);

  async function commit(next: Parameters<typeof saveSettings>[0], message: string) {
    try {
      await saveSettings(next);
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save that setting");
    }
  }

  return (
    <Card className="border-border/70 bg-panel p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary">
          <History className="size-4" />
        </span>
        <div>
          <h2 className="font-display text-base font-semibold">Chat history folding</h2>
          <p className="text-xs text-muted-foreground">
            Older messages fold away to free up screen space. Members tap once to re-list them.
          </p>
        </div>
        <Switch
          className="ml-auto"
          checked={settings.foldEnabled}
          disabled={loading}
          onCheckedChange={(value) =>
            void commit(
              { foldEnabled: value },
              value ? "Long chats will fold up" : "Chats stay fully listed",
            )
          }
          aria-label="Fold older messages"
        />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fold-hours">Fold messages older than (hours)</Label>
          <div className="flex gap-2">
            <Input
              id="fold-hours"
              type="number"
              min={1}
              max={8760}
              value={hours}
              disabled={!settings.foldEnabled || loading}
              onChange={(event) => {
                setHours(event.target.value);
                setDirtyKey("hours");
              }}
            />
            {dirtyKey === "hours" ? (
              <Button
                variant="brass"
                onClick={() => {
                  setDirtyKey(null);
                  void commit(
                    { foldAfterHours: Number(hours) },
                    `Messages older than ${Number(hours) || 24}h will fold`,
                  );
                }}
              >
                Save
              </Button>
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground">Default is 24 hours.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fold-keep">Always keep newest messages</Label>
          <div className="flex gap-2">
            <Input
              id="fold-keep"
              type="number"
              min={1}
              max={200}
              value={keep}
              disabled={!settings.foldEnabled || loading}
              onChange={(event) => {
                setKeep(event.target.value);
                setDirtyKey("keep");
              }}
            />
            {dirtyKey === "keep" ? (
              <Button
                variant="brass"
                onClick={() => {
                  setDirtyKey(null);
                  void commit(
                    { keepRecent: Number(keep) },
                    `Newest ${Number(keep) || 12} messages always stay on screen`,
                  );
                }}
              >
                Save
              </Button>
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Threads shorter than this never fold.
          </p>
        </div>
      </div>
    </Card>
  );
}
