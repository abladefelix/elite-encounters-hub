/**
 * Cash gifts.
 *
 * Gifts are tips with a real cedi value — the member pays the face value
 * through Paystack and the specialist receives it (minus the tip commission set
 * in the admin portal). Nothing here is decorative currency.
 */

export interface Gift {
  id: string;
  label: string;
  glyph: string;
  /** Face value in GHS — what the specialist is being tipped. */
  value: number;
  hint: string;
}

export const GIFT_CATALOG: Gift[] = [
  { id: "sponge", label: "Gold sponge", glyph: "🧽", value: 10, hint: "A small thank you." },
  { id: "bloom", label: "Night bloom", glyph: "🌙", value: 25, hint: "Nice work today." },
  { id: "brass-key", label: "Brass key", glyph: "🔑", value: 50, hint: "You made it effortless." },
  { id: "lantern", label: "Lantern", glyph: "🏮", value: 100, hint: "Went above and beyond." },
  { id: "crown", label: "Brass crown", glyph: "👑", value: 250, hint: "Best clean I've had." },
  { id: "midnight", label: "Midnight star", glyph: "✨", value: 500, hint: "Truly exceptional." },
];

export function getGift(id: string) {
  return GIFT_CATALOG.find((gift) => gift.id === id);
}
