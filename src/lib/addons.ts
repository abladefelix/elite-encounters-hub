/**
 * Admin-owned add-ons for ash services.
 *
 * Add-ons are fixed-price extras a member may attach to a booking in chat
 * ("inside fridge", "ironing", "windows"). Like the services catalogue, they
 * are created and priced in the control room only — never typed freehand by a
 * member — so the server can recompute the payable amount from trusted data.
 *
 * They live in the shared `platform_settings` row under the `addons` section,
 * which keeps them editable at any time without a schema change.
 */
import { useCallback, useMemo } from "react";

import { useSettingsSection } from "@/lib/platform-settings";

export interface AddonItem {
  /** Stable slug used as the React key and settings identity. */
  id: string;
  label: string;
  /** Flat price in GHS added to the booking subtotal. */
  price: number;
  hint: string;
  /** Off hides the add-on from the booking form. */
  active: boolean;
}

export interface AddonSettings {
  /** Master switch for the whole add-ons feature. */
  enabled: boolean;
  items: AddonItem[];
}

export const DEFAULT_ADDON_SETTINGS: AddonSettings = {
  enabled: true,
  items: [
    { id: "inside-fridge", label: "Inside fridge", price: 40, hint: "Emptied, wiped and deodorised.", active: true },
    { id: "inside-oven", label: "Inside oven", price: 60, hint: "Racks and glass degreased.", active: true },
    { id: "ironing", label: "Ironing pile", price: 50, hint: "Up to one basket, folded.", active: true },
    { id: "windows", label: "Interior windows", price: 45, hint: "Glass, frames and sills.", active: true },
    { id: "laundry", label: "Laundry cycle", price: 35, hint: "Wash, dry and fold one load.", active: true },
    { id: "balcony", label: "Balcony wash", price: 30, hint: "Swept, scrubbed and rinsed.", active: true },
  ],
};

export function addonSlug(label: string) {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `addon-${Date.now().toString(36)}`;
}

/**
 * Total price of the selected add-ons. Matching is by label so it works from
 * both the browser and the server, where `bookings.addons` stores labels.
 */
export function addonsTotal(labels: string[], items: AddonItem[]) {
  return labels.reduce((total, label) => {
    const match = items.find((item) => item.label.toLowerCase() === label.trim().toLowerCase());
    return total + (match?.price ?? 0);
  }, 0);
}

/** Read/write access to the add-ons catalogue. Writes are admin-only via RLS. */
export function useAddons() {
  const { value, save, ready } = useSettingsSection<AddonSettings>("addons", DEFAULT_ADDON_SETTINGS);

  const items = useMemo(() => value.items ?? [], [value.items]);
  const activeAddons = useMemo(
    () => (value.enabled ? items.filter((item) => item.active) : []),
    [items, value.enabled],
  );

  const setEnabled = useCallback(
    (enabled: boolean) => save({ ...value, enabled }),
    [save, value],
  );

  const addAddon = useCallback(
    (input: Omit<AddonItem, "id">) => {
      const id = addonSlug(input.label);
      if (items.some((item) => item.id === id)) {
        throw new Error("An add-on with that name already exists.");
      }
      return save({ ...value, items: [...items, { ...input, id }] });
    },
    [items, save, value],
  );

  const updateAddon = useCallback(
    (id: string, patch: Partial<Omit<AddonItem, "id">>) =>
      save({
        ...value,
        items: items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      }),
    [items, save, value],
  );

  const removeAddon = useCallback(
    (id: string) => save({ ...value, items: items.filter((item) => item.id !== id) }),
    [items, save, value],
  );

  return { enabled: value.enabled, items, activeAddons, ready, setEnabled, addAddon, updateAddon, removeAddon };
}
