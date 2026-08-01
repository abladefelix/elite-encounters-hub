/**
 * Admin-owned wording and language.
 *
 * Every noun the platform leans on ("specialist", "room", "booking"…) plus the
 * key navigation labels can be reworded from the control room, so the same code
 * serves a different market or vocabulary without a deploy.
 */
import { useCallback } from "react";

import { useSettingsSection } from "./platform-settings";

export const LOCALE_LANGUAGES = [
  { code: "en-GH", label: "English (Ghana)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "en-US", label: "English (US)" },
  { code: "fr-FR", label: "Français" },
  { code: "pt-PT", label: "Português" },
  { code: "ar", label: "العربية" },
] as const;

/** Every string an admin may reword, grouped for the editor. */
export const COPY_GROUPS = [
  {
    id: "people",
    title: "People",
    blurb: "How the two sides of the marketplace are named everywhere.",
    keys: [
      { key: "specialist", label: "Specialist (singular)", value: "Specialist" },
      { key: "specialists", label: "Specialists (plural)", value: "Specialists" },
      { key: "client", label: "Client (singular)", value: "Client" },
      { key: "clients", label: "Clients (plural)", value: "Clients" },
      { key: "member", label: "Member", value: "Member" },
    ],
  },
  {
    id: "commerce",
    title: "Rooms & bookings",
    blurb: "Membership tiers, jobs and the money words.",
    keys: [
      { key: "room", label: "Room (singular)", value: "Room" },
      { key: "rooms", label: "Rooms (plural)", value: "Rooms" },
      { key: "booking", label: "Booking", value: "Booking" },
      { key: "bookings", label: "Bookings", value: "Bookings" },
      { key: "service", label: "Service", value: "Service" },
      { key: "escrow", label: "Escrow", value: "Escrow" },
      { key: "gift", label: "Gift / tip", value: "Gift" },
    ],
  },
  {
    id: "navigation",
    title: "Navigation & actions",
    blurb: "Labels on the header, footer and primary buttons.",
    keys: [
      { key: "nav.specialists", label: "Browse specialists link", value: "Specialists" },
      { key: "nav.rooms", label: "Rooms link", value: "Rooms" },
      { key: "nav.messages", label: "Messages link", value: "Messages" },
      { key: "nav.howItWorks", label: "How it works link", value: "How it works" },
      { key: "action.signIn", label: "Sign in", value: "Sign in" },
      { key: "action.signUp", label: "Create account", value: "Create account" },
      { key: "action.book", label: "Book now", value: "Book now" },
    ],
  },
] as const;

export type CopyKey = (typeof COPY_GROUPS)[number]["keys"][number]["key"];

export const DEFAULT_COPY: Record<string, string> = Object.fromEntries(
  COPY_GROUPS.flatMap((group) => group.keys.map((entry) => [entry.key, entry.value])),
);

export interface LocaleSettings {
  language: string;
  /** BCP-47 tag used for dates and numbers; empty follows `language`. */
  formatLocale: string;
  currencyLabel: string;
  /** Overrides keyed by copy key. Missing keys fall back to the defaults. */
  copy: Record<string, string>;
}

export const DEFAULT_LOCALE_SETTINGS: LocaleSettings = {
  language: "en-GH",
  formatLocale: "",
  currencyLabel: "GHS",
  copy: {},
};

export function useLocaleSettings() {
  const { value, save, loading } = useSettingsSection<LocaleSettings>(
    "locale",
    DEFAULT_LOCALE_SETTINGS,
  );
  return { locale: value, save, loading };
}

/** Reads admin wording with a safe fallback to the shipped default. */
export function useCopy() {
  const { locale, loading } = useLocaleSettings();
  const overrides = locale.copy ?? {};
  const t = useCallback(
    (key: CopyKey | string, fallback?: string) =>
      (overrides[key] ?? "").trim() || DEFAULT_COPY[key] || fallback || key,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale.copy],
  );
  return { t, language: locale.language, currencyLabel: locale.currencyLabel, loading };
}
