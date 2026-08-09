/**
 * Chat history folding.
 *
 * Long threads get heavy on a phone, so anything older than the admin-set
 * window is folded away behind a single "earlier messages" row. Nothing is
 * deleted — one tap re-lists the whole history for that thread.
 */
import { useSettingsSection } from "@/lib/platform-settings";

export interface ChatHistorySettings {
  /** Master switch for folding older messages. */
  foldEnabled: boolean;
  /** Messages older than this many hours fold away. */
  foldAfterHours: number;
  /** Always keep at least this many of the newest messages on screen. */
  keepRecent: number;
}

export const DEFAULT_CHAT_HISTORY_SETTINGS: ChatHistorySettings = {
  foldEnabled: true,
  foldAfterHours: 24,
  keepRecent: 12,
};

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function sanitizeChatHistory(value: unknown): ChatHistorySettings {
  const next = { ...DEFAULT_CHAT_HISTORY_SETTINGS };
  if (!value || typeof value !== "object") return next;
  const record = value as Record<string, unknown>;
  if (typeof record["foldEnabled"] === "boolean") next.foldEnabled = record["foldEnabled"];
  if (typeof record["foldAfterHours"] === "number") {
    next.foldAfterHours = clamp(record["foldAfterHours"], 1, 8760, 24);
  }
  if (typeof record["keepRecent"] === "number") {
    next.keepRecent = clamp(record["keepRecent"], 1, 200, 12);
  }
  return next;
}

/**
 * Splits a thread into the part that stays folded and the part on screen.
 * `folded` is always a prefix of the list, so day separators keep working.
 */
export function splitFoldedMessages<T extends { created_at: string }>(
  items: T[],
  settings: ChatHistorySettings,
  expanded: boolean,
): { folded: T[]; shown: T[] } {
  if (expanded || !settings.foldEnabled || items.length <= settings.keepRecent) {
    return { folded: [], shown: items };
  }
  const cutoff = Date.now() - settings.foldAfterHours * 3_600_000;
  const limit = items.length - settings.keepRecent;
  let index = 0;
  while (index < limit && new Date(items[index]!.created_at).getTime() < cutoff) index += 1;
  if (index === 0) return { folded: [], shown: items };
  return { folded: items.slice(0, index), shown: items.slice(index) };
}

export function useChatHistorySettings() {
  const { value, save, loading } = useSettingsSection<ChatHistorySettings>(
    "chatHistory",
    DEFAULT_CHAT_HISTORY_SETTINGS,
  );
  const settings = sanitizeChatHistory(value);
  return {
    settings,
    loading,
    saveSettings: async (next: Partial<ChatHistorySettings>) =>
      save(sanitizeChatHistory({ ...settings, ...next })),
  };
}
