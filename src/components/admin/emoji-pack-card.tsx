import { useState } from "react";
import { Loader2, Plus, Smile, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useEmojiPacks, parseEmojiList, type EmojiPack } from "@/lib/chat-emoji";
import { useRoomSettings } from "@/lib/room-settings";
import type { Tier } from "@/lib/types";

/**
 * Control-room editor for extra chat emoji. Each pack is a named set of emoji
 * plus the rooms allowed to use it — leaving every room unticked publishes the
 * pack to all rooms.
 */
export function EmojiPackCard() {
  const { packs, savePacks, loading } = useEmojiPacks();
  const { roomIds, profiles } = useRoomSettings();
  const [label, setLabel] = useState("");
  const [raw, setRaw] = useState("");

  const roomLabel = (room: Tier) => profiles[room]?.name ?? room;

  async function commit(next: EmojiPack[], message: string) {
    try {
      await savePacks(next);
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save that emoji pack");
    }
  }

  function addPack() {
    const emoji = parseEmojiList(raw);
    if (!emoji.length) {
      toast.error("Paste at least one emoji");
      return;
    }
    const pack: EmojiPack = {
      id: `pack-${Date.now().toString(36)}`,
      label: label.trim() || "Custom pack",
      emoji,
      rooms: [],
      enabled: true,
    };
    setLabel("");
    setRaw("");
    void commit([...packs, pack], `${pack.label} published to every room`);
  }

  function update(id: string, patch: Partial<EmojiPack>, message: string) {
    void commit(
      packs.map((pack) => (pack.id === id ? { ...pack, ...patch } : pack)),
      message,
    );
  }

  return (
    <Card className="border-border/70 bg-panel p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary">
          <Smile className="size-4" />
        </span>
        <div>
          <h2 className="font-display text-base font-semibold">Chat emoji packs</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Extra emoji shown in the chat picker on top of the built-in trays. Tick the rooms that
            may use a pack, or leave every room unticked to publish it platform-wide.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading packs…
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {packs.map((pack) => (
            <div key={pack.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{pack.label}</p>
                <Badge variant="secondary" className="text-[10px]">
                  {pack.emoji.length} emoji
                </Badge>
                <Badge
                  variant={pack.rooms.length ? "secondary" : "default"}
                  className="text-[10px]"
                >
                  {pack.rooms.length ? `${pack.rooms.length} room(s)` : "All rooms"}
                </Badge>
                <div className="ml-auto flex items-center gap-2">
                  <Switch
                    checked={pack.enabled}
                    onCheckedChange={(next) =>
                      update(
                        pack.id,
                        { enabled: next },
                        next ? `${pack.label} enabled` : `${pack.label} hidden from chat`,
                      )
                    }
                    aria-label={`Enable ${pack.label}`}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${pack.label}`}
                    onClick={() =>
                      void commit(
                        packs.filter((item) => item.id !== pack.id),
                        `${pack.label} removed`,
                      )
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>

              <p className="mt-2 break-words text-xl leading-relaxed">{pack.emoji.join(" ")}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                {roomIds.map((room) => {
                  const active = pack.rooms.includes(room);
                  return (
                    <Button
                      key={room}
                      size="sm"
                      variant={active ? "brass" : "soft"}
                      onClick={() =>
                        update(
                          pack.id,
                          {
                            rooms: active
                              ? pack.rooms.filter((item) => item !== room)
                              : [...pack.rooms, room],
                          },
                          `${pack.label} rooms updated`,
                        )
                      }
                    >
                      {roomLabel(room)}
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
          {!packs.length ? (
            <p className="text-xs text-muted-foreground">
              No extra packs yet — members see the built-in emoji trays only.
            </p>
          ) : null}
        </div>
      )}

      <div className="mt-4 rounded-lg border border-dashed border-border bg-surface/60 p-3">
        <p className="text-sm font-medium">Add a pack</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="emoji-pack-label">Pack name</Label>
            <Input
              id="emoji-pack-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Ultimate room extras"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emoji-pack-list">Emoji</Label>
            <Input
              id="emoji-pack-list"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              placeholder="🥇 🫧 🧽 🪣"
            />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Paste emoji separated by spaces — {parseEmojiList(raw).length} detected.
          </p>
          <Button size="sm" variant="soft" onClick={addPack} disabled={!parseEmojiList(raw).length}>
            <Plus className="size-3.5" /> Add pack
          </Button>
        </div>
      </div>
    </Card>
  );
}
