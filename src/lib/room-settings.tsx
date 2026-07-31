import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import type { Tier } from "./types";

/**
 * Room capability layer.
 *
 * Admins decide, per room, which features and privileges a subscription
 * unlocks — calls, sharing, scheduling windows, booking limits, cover — plus
 * the room's theme colour. The client app reads the same store, so a change in
 * the admin dashboard immediately changes what members see and can do.
 *
 * Persisted in localStorage today; swap `read`/`write` for backend calls later.
 */

/* ------------------------------------------------------------------ accents */

export const ROOM_ACCENTS = {
  brass: { label: "Brass", color: "oklch(0.78 0.12 84)", soft: "oklch(0.86 0.08 84)" },
  emerald: { label: "Emerald", color: "oklch(0.74 0.13 162)", soft: "oklch(0.84 0.09 162)" },
  azure: { label: "Azure", color: "oklch(0.72 0.13 240)", soft: "oklch(0.83 0.09 240)" },
  orchid: { label: "Orchid", color: "oklch(0.72 0.15 320)", soft: "oklch(0.83 0.1 320)" },
  ember: { label: "Ember", color: "oklch(0.7 0.16 34)", soft: "oklch(0.82 0.11 34)" },
  slate: { label: "Slate", color: "oklch(0.72 0.03 250)", soft: "oklch(0.84 0.02 250)" },
} as const;

export type RoomAccentId = keyof typeof ROOM_ACCENTS;

export const ROOM_ACCENT_IDS = Object.keys(ROOM_ACCENTS) as RoomAccentId[];

/** CSS variables a component can spread to theme itself with a room accent. */
export function roomAccentStyle(accent: RoomAccentId): CSSProperties {
  const entry = ROOM_ACCENTS[accent] ?? ROOM_ACCENTS.brass;
  return {
    ["--room-accent" as string]: entry.color,
    ["--room-accent-soft" as string]: entry.soft,
  } as CSSProperties;
}

/* --------------------------------------------------------------- privileges */

export interface RoomPrivileges {
  /* chat & calls */
  audio: boolean;
  video: boolean;
  photoSharing: boolean;
  fileSharing: boolean;
  /* booking */
  addOns: boolean;
  recurringSchedules: boolean;
  keyHandling: boolean;
  dedicatedManager: boolean;
  /* numeric limits */
  bookingLimit: number | null; // null = unlimited
  leadTimeHours: number; // how far ahead a booking must be placed
  supportResponseHours: number;
  damageCover: number; // GHS
  /* presentation */
  accent: RoomAccentId;
}

export type RoomPolicyMap = Record<Tier, RoomPrivileges>;

export const DEFAULT_ROOM_POLICY: RoomPolicyMap = {
  basic: {
    audio: true,
    video: false,
    photoSharing: true,
    fileSharing: false,
    addOns: false,
    recurringSchedules: false,
    keyHandling: false,
    dedicatedManager: false,
    bookingLimit: 2,
    leadTimeHours: 48,
    supportResponseHours: 48,
    damageCover: 0,
    accent: "slate",
  },
  premium: {
    audio: true,
    video: true,
    photoSharing: true,
    fileSharing: true,
    addOns: true,
    recurringSchedules: true,
    keyHandling: false,
    dedicatedManager: false,
    bookingLimit: 6,
    leadTimeHours: 24,
    supportResponseHours: 4,
    damageCover: 1000,
    accent: "brass",
  },
  ultimate: {
    audio: true,
    video: true,
    photoSharing: true,
    fileSharing: true,
    addOns: true,
    recurringSchedules: true,
    keyHandling: true,
    dedicatedManager: true,
    bookingLimit: null,
    leadTimeHours: 6,
    supportResponseHours: 1,
    damageCover: 5000,
    accent: "orchid",
  },
};

export type BooleanPrivilege = {
  [K in keyof RoomPrivileges]: RoomPrivileges[K] extends boolean ? K : never;
}[keyof RoomPrivileges];

export type NumericPrivilege = "bookingLimit" | "leadTimeHours" | "supportResponseHours" | "damageCover";

export const PRIVILEGE_GROUPS: {
  title: string;
  items: { key: BooleanPrivilege; label: string; hint: string }[];
}[] = [
  {
    title: "Chat & calls",
    items: [
      { key: "audio", label: "Voice calls", hint: "Place audio calls from a chat thread." },
      { key: "video", label: "Video calls", hint: "Video walkthroughs of the space." },
      { key: "photoSharing", label: "Photo sharing", hint: "Attach photos in chat." },
      { key: "fileSharing", label: "File sharing", hint: "Checklists, floor plans, invoices." },
    ],
  },
  {
    title: "Booking privileges",
    items: [
      { key: "addOns", label: "Deep clean & move-out add-ons", hint: "Access premium add-on catalogue." },
      { key: "recurringSchedules", label: "Recurring schedules", hint: "Standing weekly or monthly visits." },
      { key: "keyHandling", label: "Key handling", hint: "Specialists may hold keys for entry." },
      { key: "dedicatedManager", label: "Dedicated account manager", hint: "Named human on the account." },
    ],
  },
];

export const TIERS: Tier[] = ["basic", "premium", "ultimate"];

const STORAGE_KEY = "ashnight-room-policy-v2";

function clampNumber(value: unknown, fallback: number, min = 0) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, value) : fallback;
}

function sanitize(value: unknown): RoomPolicyMap {
  const next: RoomPolicyMap = {
    basic: { ...DEFAULT_ROOM_POLICY.basic },
    premium: { ...DEFAULT_ROOM_POLICY.premium },
    ultimate: { ...DEFAULT_ROOM_POLICY.ultimate },
  };
  if (!value || typeof value !== "object") return next;

  for (const tier of TIERS) {
    const entry = (value as Record<string, unknown>)[tier];
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const target = next[tier];

    for (const group of PRIVILEGE_GROUPS) {
      for (const item of group.items) {
        if (typeof record[item.key] === "boolean") {
          target[item.key] = record[item.key] as boolean;
        }
      }
    }

    if (record["bookingLimit"] === null) target.bookingLimit = null;
    else if (typeof record["bookingLimit"] === "number") {
      target.bookingLimit = clampNumber(record["bookingLimit"], target.bookingLimit ?? 1, 1);
    }
    target.leadTimeHours = clampNumber(record["leadTimeHours"], target.leadTimeHours, 1);
    target.supportResponseHours = clampNumber(
      record["supportResponseHours"],
      target.supportResponseHours,
      1,
    );
    target.damageCover = clampNumber(record["damageCover"], target.damageCover);

    const accent = record["accent"];
    if (typeof accent === "string" && accent in ROOM_ACCENTS) {
      target.accent = accent as RoomAccentId;
    }
  }
  return next;
}

/* ----------------------------------------------------------------- context */

interface RoomSettingsContextValue {
  policy: RoomPolicyMap;
  setPrivilege: <K extends keyof RoomPrivileges>(
    room: Tier,
    key: K,
    value: RoomPrivileges[K],
  ) => void;
  canCall: (room: Tier, feature: "audio" | "video") => boolean;
  can: (room: Tier, feature: BooleanPrivilege) => boolean;
  accentOf: (room: Tier) => RoomAccentId;
  resetPolicy: () => void;
}

const RoomSettingsContext = createContext<RoomSettingsContextValue | null>(null);

export function RoomSettingsProvider({ children }: { children: ReactNode }) {
  const [policy, setPolicy] = useState<RoomPolicyMap>(DEFAULT_ROOM_POLICY);

  // Read after hydration so server and first client render match.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setPolicy(sanitize(JSON.parse(raw)));
    } catch {
      /* ignore malformed storage */
    }

    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      try {
        setPolicy(event.newValue ? sanitize(JSON.parse(event.newValue)) : DEFAULT_ROOM_POLICY);
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persist = useCallback((next: RoomPolicyMap) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const setPrivilege = useCallback<RoomSettingsContextValue["setPrivilege"]>(
    (room, key, value) => {
      setPolicy((current) => {
        const next: RoomPolicyMap = {
          ...current,
          [room]: { ...current[room], [key]: value },
        };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const resetPolicy = useCallback(() => {
    setPolicy(DEFAULT_ROOM_POLICY);
    persist(DEFAULT_ROOM_POLICY);
  }, [persist]);

  const value = useMemo<RoomSettingsContextValue>(
    () => ({
      policy,
      setPrivilege,
      canCall: (room, feature) => policy[room]?.[feature] ?? false,
      can: (room, feature) => policy[room]?.[feature] ?? false,
      accentOf: (room) => policy[room]?.accent ?? "brass",
      resetPolicy,
    }),
    [policy, setPrivilege, resetPolicy],
  );

  return (
    <RoomSettingsContext.Provider value={value}>{children}</RoomSettingsContext.Provider>
  );
}

export function useRoomSettings() {
  const context = useContext(RoomSettingsContext);
  if (!context) {
    throw new Error("useRoomSettings must be used inside <RoomSettingsProvider>");
  }
  return context;
}

/** Safe for components that may render outside the provider (e.g. storybook). */
export function useRoomAccent(room: Tier): RoomAccentId {
  const context = useContext(RoomSettingsContext);
  return context?.accentOf(room) ?? DEFAULT_ROOM_POLICY[room].accent;
}

/* ------------------------------------------------------------- formatting */

export function formatBookingLimit(limit: number | null) {
  return limit === null ? "Unlimited" : `${limit} / month`;
}

export function formatLeadTime(hours: number) {
  if (hours <= 6) return "Same-day dispatch";
  if (hours <= 24) return "Next-day scheduling";
  return `${hours}h ahead`;
}

export function formatSupport(hours: number) {
  return hours <= 1 ? "Within 1h" : `Within ${hours}h`;
}
