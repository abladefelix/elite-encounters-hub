/**
 * Admin-owned emoji packs.
 *
 * The chat picker always ships with the built-in trays. On top of that an admin
 * can publish extra packs from the control room and choose which rooms may use
 * them, so an ultimate room can carry emoji a basic room never sees.
 */
import { useSettingsSection } from "@/lib/platform-settings";
import type { Tier } from "@/lib/types";

export interface EmojiPack {
  id: string;
  label: string;
  emoji: string[];
  /** Rooms allowed to use the pack. Empty list = every room. */
  rooms: Tier[];
  enabled: boolean;
}

export interface EmojiSettings {
  packs: EmojiPack[];
}

export const DEFAULT_EMOJI_SETTINGS: EmojiSettings = { packs: [] };

/** Splits a pasted string into individual emoji, keeping multi-codepoint ones intact. */
export function parseEmojiList(input: string): string[] {
  const cleaned = input.replace(/[,\s]+/g, " ").trim();
  if (!cleaned) return [];
  const chunks = cleaned.split(" ").filter(Boolean);
  const out: string[] = [];
  for (const chunk of chunks) {
    const Segmenter = (
      Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => {
        segment: (value: string) => Iterable<{ segment: string }>;
      } }
    ).Segmenter;
    if (Segmenter) {
      for (const part of new Segmenter(undefined, { granularity: "grapheme" }).segment(chunk)) {
        if (part.segment.trim()) out.push(part.segment);
      }
    } else {
      out.push(...Array.from(chunk));
    }
  }
  return out.filter((value, index) => out.indexOf(value) === index).slice(0, 120);
}

function sanitizePack(value: unknown): EmojiPack | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record["id"] === "string" ? record["id"] : "";
  if (!id) return null;
  const emoji = Array.isArray(record["emoji"])
    ? record["emoji"].filter((item): item is string => typeof item === "string")
    : [];
  const rooms = Array.isArray(record["rooms"])
    ? (record["rooms"].filter((item): item is Tier => typeof item === "string") as Tier[])
    : [];
  return {
    id,
    label: typeof record["label"] === "string" ? record["label"] : "Custom pack",
    emoji,
    rooms,
    enabled: record["enabled"] !== false,
  };
}

export function sanitizeEmojiPacks(value: unknown): EmojiPack[] {
  if (!Array.isArray(value)) return [];
  return value.map(sanitizePack).filter((pack): pack is EmojiPack => Boolean(pack));
}

/** Packs a member in `room` is allowed to see. */
export function packsForRoom(packs: EmojiPack[], room: Tier | null | undefined): EmojiPack[] {
  return packs.filter(
    (pack) =>
      pack.enabled &&
      pack.emoji.length > 0 &&
      (pack.rooms.length === 0 || (room ? pack.rooms.includes(room) : false)),
  );
}

export function useEmojiPacks() {
  const { value, save, loading } = useSettingsSection<EmojiSettings>(
    "emoji",
    DEFAULT_EMOJI_SETTINGS,
  );
  const packs = sanitizeEmojiPacks(value.packs);

  return {
    packs,
    loading,
    savePacks: async (next: EmojiPack[]) => save({ ...value, packs: next }),
  };
}
