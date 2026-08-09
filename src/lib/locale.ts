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

/**
 * Every string an admin may reword, grouped for the editor.
 *
 * `usedIn` lists the exact screens/elements each word appears on, so an admin
 * editing a term like "Ultimate" can see which surface it changes before saving.
 */
export const COPY_GROUPS = [
  {
    id: "people",
    title: "People",
    blurb: "How the two sides of the marketplace are named everywhere.",
    keys: [
      {
        key: "specialist",
        label: "Doll (singular)",
        value: "Doll",
        usedIn: ["Specialist profile page", "Chat header", "Booking & quote dialogs", "Wallet"],
      },
      {
        key: "specialists",
        label: "Dolls (plural)",
        value: "Dolls",
        usedIn: ["Header nav", "Mobile tab bar", "Directory page title", "Home page"],
      },
      {
        key: "client",
        label: "Client (singular)",
        value: "Client",
        usedIn: ["Chat header", "Booking cards", "Escrow entries", "Wallet"],
      },
      {
        key: "clients",
        label: "Clients (plural)",
        value: "Clients",
        usedIn: ["How it works page", "Rooms page", "Admin roster tab labels"],
      },
      {
        key: "member",
        label: "Member",
        value: "Member",
        usedIn: ["Auth screens", "Rooms page", "Welcome message", "Footer"],
      },
    ],
  },
  {
    id: "commerce",
    title: "Rooms & bookings",
    blurb: "Membership tiers, jobs and the money words.",
    keys: [
      {
        key: "room",
        label: "Room (singular)",
        value: "Room",
        usedIn: ["Room badges", "Rooms page cards", "Chat header", "Membership checkout"],
      },
      {
        key: "rooms",
        label: "Rooms (plural)",
        value: "Rooms",
        usedIn: ["Header nav", "Mobile tab bar", "Rooms page title"],
      },
      {
        key: "booking",
        label: "Booking",
        value: "Booking",
        usedIn: ["Service request dialog", "Chat booking bubbles", "Wallet timeline"],
      },
      {
        key: "bookings",
        label: "Bookings",
        value: "Bookings",
        usedIn: ["Wallet page", "Member dashboard strip", "How it works"],
      },
      {
        key: "service",
        label: "Service",
        value: "Service",
        usedIn: ["Service request dialog", "Specialist profile services list", "Invoices"],
      },
      {
        key: "escrow",
        label: "Escrow",
        value: "Escrow",
        usedIn: ["Wallet page", "Chat payment bubbles", "Receipts"],
      },
      {
        key: "gift",
        label: "Gift / tip",
        value: "Gift",
        usedIn: ["Chat gift dialog", "Wallet timeline"],
      },
    ],
  },
  {
    id: "navigation",
    title: "Navigation & actions",
    blurb: "Labels on the header, footer and primary buttons.",
    keys: [
      {
        key: "nav.specialists",
        label: "Browse dolls link",
        value: "Dolls",
        usedIn: ["Header nav (desktop)", "Mobile menu", "Mobile tab bar"],
      },
      {
        key: "nav.groups",
        label: "Ash groups link",
        value: "Ash groups",
        usedIn: ["Header nav (desktop)", "Mobile menu"],
      },
      {
        key: "nav.rooms",
        label: "Rooms link",
        value: "Rooms",
        usedIn: ["Header nav (desktop)", "Mobile menu", "Mobile tab bar"],
      },
      {
        key: "nav.messages",
        label: "Messages link",
        value: "Messages",
        usedIn: ["Header nav (desktop)", "Mobile menu", "Mobile tab bar"],
      },
      {
        key: "nav.wallet",
        label: "Money / wallet link",
        value: "Money",
        usedIn: ["Header nav (desktop)", "Mobile menu", "Mobile tab bar"],
      },
      {
        key: "nav.howItWorks",
        label: "How it works link",
        value: "How it works",
        usedIn: ["Header nav (desktop)", "Mobile menu", "Footer"],
      },
      {
        key: "action.signIn",
        label: "Sign in",
        value: "Sign in",
        usedIn: ["Auth page tab", "Header button", "Mobile menu"],
      },
      {
        key: "action.signUp",
        label: "Create account",
        value: "Create account",
        usedIn: ["Auth page tab", "Apply page submit button"],
      },
      {
        key: "action.book",
        label: "Book now",
        value: "Book now",
        usedIn: ["Specialist profile page", "Specialist cards", "Chat action bar"],
      },
    ],
  },
  {
    id: "chat",
    title: "Chat & calls",
    blurb: "Wording inside conversations, voice and video calls.",
    keys: [
      {
        key: "chat.call",
        label: "Call (noun)",
        value: "call",
        usedIn: ["Chat header call buttons", "Call overlay", "Chat system notes"],
      },
      {
        key: "chat.voice",
        label: "Voice (audio call word)",
        value: "Voice",
        usedIn: ["Chat header voice button", "Call overlay title", "Chat system notes"],
      },
      {
        key: "chat.video",
        label: "Video (video call word)",
        value: "Video",
        usedIn: ["Chat header video button", "Call overlay title", "Chat system notes"],
      },
      {
        key: "chat.startCall",
        label: "Start call button",
        value: "Start",
        usedIn: ["Chat header call button tooltips & aria labels"],
      },
      {
        key: "chat.endCall",
        label: "End call button",
        value: "End call",
        usedIn: ["Call overlay hang-up button"],
      },
      {
        key: "chat.callEnded",
        label: "Call ended note",
        value: "Call ended.",
        usedIn: ["Chat system message after hanging up"],
      },
      {
        key: "chat.callsOff",
        label: "Calls disabled notice",
        value: "Calling is disabled for this room. Chat and booking stay open.",
        usedIn: ["Chat header banner when a room has calls switched off"],
      },
      {
        key: "chat.mute",
        label: "Mute",
        value: "Mute",
        usedIn: ["Call overlay controls"],
      },
      {
        key: "chat.unmute",
        label: "Unmute",
        value: "Unmute",
        usedIn: ["Call overlay controls"],
      },
      {
        key: "chat.speaker",
        label: "Speaker",
        value: "Speaker",
        usedIn: ["Call overlay controls (voice calls)"],
      },
      {
        key: "chat.cameraOff",
        label: "Camera off",
        value: "Camera off",
        usedIn: ["Call overlay self-view placeholder"],
      },
      {
        key: "chat.report",
        label: "Report member",
        value: "Report",
        usedIn: ["Chat header flag button", "Report dialog"],
      },
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
  /**
   * Free-form find/replace rules applied to every rendered string on the site
   * and in the app, for copy that lives inside sentences rather than the keyed
   * dictionary above. See `phrase-overrides.tsx`.
   */
  phrases?: import("./phrase-overrides").PhraseRule[];
}

export const DEFAULT_LOCALE_SETTINGS: LocaleSettings = {
  language: "en-GH",
  formatLocale: "",
  currencyLabel: "GHS",
  copy: {},
  phrases: [],
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
