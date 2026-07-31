/**
 * Cash gifts.
 *
 * Gifts are tips with a real cedi value — the member pays the face value
 * through Paystack and the specialist receives it (minus the tip commission set
 * in the admin portal). Nothing here is decorative currency.
 *
 * Values, labels and per-room availability are all admin-editable; these are
 * only the shipping defaults (see `src/lib/room-settings.tsx` for the store).
 */

import type { Tier } from "./types";

export interface Gift {
  id: string;
  label: string;
  glyph: string;
  /** Face value in GHS — what the specialist is being tipped. */
  value: number;
  hint: string;
  /** Off removes the gift from every room. */
  enabled: boolean;
}

export const DEFAULT_GIFT_CATALOG: Gift[] = [
  { id: "sponge", label: "Gold sponge", glyph: "🧽", value: 10, hint: "A small thank you.", enabled: true },
  { id: "bloom", label: "Night bloom", glyph: "🌙", value: 25, hint: "Nice work today.", enabled: true },
  { id: "brass-key", label: "Brass key", glyph: "🔑", value: 50, hint: "You made it effortless.", enabled: true },
  { id: "lantern", label: "Lantern", glyph: "🏮", value: 100, hint: "Went above and beyond.", enabled: true },
  { id: "crown", label: "Brass crown", glyph: "👑", value: 250, hint: "Best clean I've had.", enabled: true },
  { id: "midnight", label: "Midnight star", glyph: "✨", value: 500, hint: "Truly exceptional.", enabled: true },
];

/** What a single room may send, and how far a custom amount may go. */
export interface RoomGiftRules {
  /** Off hides gifting entirely for this room. */
  enabled: boolean;
  /** Gift ids this room may send. */
  giftIds: string[];
  /** Members of this room may type their own amount. */
  allowCustom: boolean;
  minGift: number;
  maxGift: number;
}

export type RoomGiftRulesMap = Record<Tier, RoomGiftRules>;

export const DEFAULT_ROOM_GIFT_RULES: RoomGiftRulesMap = {
  basic: {
    enabled: true,
    giftIds: ["sponge", "bloom", "brass-key"],
    allowCustom: false,
    minGift: 5,
    maxGift: 100,
  },
  premium: {
    enabled: true,
    giftIds: ["sponge", "bloom", "brass-key", "lantern", "crown"],
    allowCustom: true,
    minGift: 5,
    maxGift: 500,
  },
  ultimate: {
    enabled: true,
    giftIds: ["sponge", "bloom", "brass-key", "lantern", "crown", "midnight"],
    allowCustom: true,
    minGift: 5,
    maxGift: 2000,
  },
};
