import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  DEFAULT_GIFT_CATALOG,
  DEFAULT_ROOM_GIFT_RULES,
  type Gift,
  type RoomGiftRules,
  type RoomGiftRulesMap,
} from "./gifts";
import { rooms } from "./mock-data";
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

/* ------------------------------------------------------ editable room profile */

/** Commercial + identity fields an admin may edit per room. */
export interface RoomProfile {
  name: string;
  tagline: string;
  priceMonthly: number;
  visitFeeMin: number;
  visitFeeMax: number;
  seatsLeft: number;
  intakeOpen: boolean;
}

export type RoomProfileMap = Record<Tier, RoomProfile>;

function profileFromMock(tier: Tier): RoomProfile {
  const room = rooms.find((item) => item.id === tier);
  return {
    name: room?.name ?? tier,
    tagline: room?.tagline ?? "",
    priceMonthly: room?.priceMonthly ?? 0,
    visitFeeMin: room?.visitFeeRange[0] ?? 0,
    visitFeeMax: room?.visitFeeRange[1] ?? 0,
    seatsLeft: room?.seatsLeft ?? 0,
    intakeOpen: (room?.seatsLeft ?? 0) > 0,
  };
}

export const DEFAULT_ROOM_PROFILES: RoomProfileMap = {
  basic: profileFromMock("basic"),
  premium: profileFromMock("premium"),
  ultimate: profileFromMock("ultimate"),
};

/* -------------------------------------------------- platform-wide admin knobs */

export interface PlatformSettings {
  /** Commission taken from every booking, in percent. */
  platformFeePct: number;
  /** Allow members to request bookings at all. */
  bookingsEnabled: boolean;
  /** Global kill switch for calling, on top of per-room privileges. */
  callsEnabled: boolean;
  /** Members may pick their own light/dark theme. */
  memberThemeChoice: boolean;
  /** Theme every visitor gets before (or instead of) choosing their own. */
  defaultTheme: DefaultTheme;
}

export type DefaultTheme = "dark" | "light" | "system";

export const DEFAULT_THEME_OPTIONS: { id: DefaultTheme; label: string; hint: string }[] = [
  { id: "dark", label: "Dark", hint: "Midnight ink — the signature look." },
  { id: "light", label: "Light", hint: "Brass on paper." },
  { id: "system", label: "System", hint: "Follow the visitor's device." },
];

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  platformFeePct: 12,
  bookingsEnabled: true,
  callsEnabled: true,
  memberThemeChoice: true,
  defaultTheme: "dark",
};

/* ------------------------------------------------------------------- gifts */

/** Admin-owned gift catalogue plus which rooms may send which gift. */
export interface GiftSettings {
  catalog: Gift[];
  rooms: RoomGiftRulesMap;
}

export const DEFAULT_GIFT_SETTINGS: GiftSettings = {
  catalog: DEFAULT_GIFT_CATALOG,
  rooms: DEFAULT_ROOM_GIFT_RULES,
};

export const ROOM_SETTINGS_STORAGE_KEY = "ashnight-room-policy-v4";
const STORAGE_KEY = ROOM_SETTINGS_STORAGE_KEY;

/** Event fired in the current tab whenever admin settings are written. */
export const ROOM_SETTINGS_EVENT = "ashnight-room-settings-change";

interface StoredState {
  policy: RoomPolicyMap;
  profiles: RoomProfileMap;
  platform: PlatformSettings;
  gifts: GiftSettings;
}

function clampNumber(value: unknown, fallback: number, min = 0) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, value) : fallback;
}


function sanitizePolicy(value: unknown): RoomPolicyMap {
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

function sanitizeProfiles(value: unknown): RoomProfileMap {
  const next: RoomProfileMap = {
    basic: { ...DEFAULT_ROOM_PROFILES.basic },
    premium: { ...DEFAULT_ROOM_PROFILES.premium },
    ultimate: { ...DEFAULT_ROOM_PROFILES.ultimate },
  };
  if (!value || typeof value !== "object") return next;

  for (const tier of TIERS) {
    const entry = (value as Record<string, unknown>)[tier];
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const target = next[tier];

    if (typeof record["name"] === "string" && record["name"].trim()) {
      target.name = record["name"] as string;
    }
    if (typeof record["tagline"] === "string") target.tagline = record["tagline"] as string;
    target.priceMonthly = clampNumber(record["priceMonthly"], target.priceMonthly);
    target.visitFeeMin = clampNumber(record["visitFeeMin"], target.visitFeeMin);
    target.visitFeeMax = clampNumber(record["visitFeeMax"], target.visitFeeMax);
    target.seatsLeft = clampNumber(record["seatsLeft"], target.seatsLeft);
    if (typeof record["intakeOpen"] === "boolean") {
      target.intakeOpen = record["intakeOpen"] as boolean;
    }
  }
  return next;
}

function sanitizePlatform(value: unknown): PlatformSettings {
  const next = { ...DEFAULT_PLATFORM_SETTINGS };
  if (!value || typeof value !== "object") return next;
  const record = value as Record<string, unknown>;
  next.platformFeePct = Math.min(50, clampNumber(record["platformFeePct"], next.platformFeePct));
  for (const key of ["bookingsEnabled", "callsEnabled", "memberThemeChoice"] as const) {
    if (typeof record[key] === "boolean") next[key] = record[key] as boolean;
  }
  const theme = record["defaultTheme"];
  if (theme === "dark" || theme === "light" || theme === "system") {
    next.defaultTheme = theme;
  }
  return next;
}

function sanitizeGifts(value: unknown): GiftSettings {
  const catalog: Gift[] = DEFAULT_GIFT_CATALOG.map((gift) => ({ ...gift }));
  const roomsRules: RoomGiftRulesMap = {
    basic: { ...DEFAULT_ROOM_GIFT_RULES.basic, giftIds: [...DEFAULT_ROOM_GIFT_RULES.basic.giftIds] },
    premium: {
      ...DEFAULT_ROOM_GIFT_RULES.premium,
      giftIds: [...DEFAULT_ROOM_GIFT_RULES.premium.giftIds],
    },
    ultimate: {
      ...DEFAULT_ROOM_GIFT_RULES.ultimate,
      giftIds: [...DEFAULT_ROOM_GIFT_RULES.ultimate.giftIds],
    },
  };
  const next: GiftSettings = { catalog, rooms: roomsRules };
  if (!value || typeof value !== "object") return next;
  const record = value as Record<string, unknown>;

  const storedCatalog = record["catalog"];
  if (Array.isArray(storedCatalog)) {
    for (const raw of storedCatalog) {
      if (!raw || typeof raw !== "object") continue;
      const entry = raw as Record<string, unknown>;
      const target = catalog.find((gift) => gift.id === entry["id"]);
      if (!target) continue;
      if (typeof entry["label"] === "string" && entry["label"].trim()) {
        target.label = entry["label"] as string;
      }
      if (typeof entry["glyph"] === "string" && entry["glyph"].trim()) {
        target.glyph = entry["glyph"] as string;
      }
      if (typeof entry["hint"] === "string") target.hint = entry["hint"] as string;
      target.value = clampNumber(entry["value"], target.value, 1);
      if (typeof entry["enabled"] === "boolean") target.enabled = entry["enabled"] as boolean;
    }
  }

  const storedRooms = record["rooms"];
  if (storedRooms && typeof storedRooms === "object") {
    for (const tier of TIERS) {
      const raw = (storedRooms as Record<string, unknown>)[tier];
      if (!raw || typeof raw !== "object") continue;
      const entry = raw as Record<string, unknown>;
      const target = roomsRules[tier];
      if (typeof entry["enabled"] === "boolean") target.enabled = entry["enabled"] as boolean;
      if (typeof entry["allowCustom"] === "boolean") {
        target.allowCustom = entry["allowCustom"] as boolean;
      }
      target.minGift = clampNumber(entry["minGift"], target.minGift, 1);
      target.maxGift = clampNumber(entry["maxGift"], target.maxGift, target.minGift);
      if (Array.isArray(entry["giftIds"])) {
        target.giftIds = (entry["giftIds"] as unknown[]).filter(
          (id): id is string => typeof id === "string" && catalog.some((gift) => gift.id === id),
        );
      }
    }
  }
  return next;
}

/** Read the admin-chosen default theme without needing the React context. */
export function readDefaultTheme(): DefaultTheme {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PLATFORM_SETTINGS.defaultTheme;
    return sanitizePlatform((JSON.parse(raw) as Record<string, unknown>)["platform"]).defaultTheme;
  } catch {
    return DEFAULT_PLATFORM_SETTINGS.defaultTheme;
  }
}

function sanitizeState(value: unknown): StoredState {
  const record = (value ?? {}) as Record<string, unknown>;
  // v2 stored the policy map at the root; keep those settings working.
  const policySource = record["policy"] ?? record;
  return {
    policy: sanitizePolicy(policySource),
    profiles: sanitizeProfiles(record["profiles"]),
    platform: sanitizePlatform(record["platform"]),
    gifts: sanitizeGifts(record["gifts"]),
  };
}

const DEFAULT_STATE: StoredState = {
  policy: DEFAULT_ROOM_POLICY,
  profiles: DEFAULT_ROOM_PROFILES,
  platform: DEFAULT_PLATFORM_SETTINGS,
  gifts: DEFAULT_GIFT_SETTINGS,
};

/* ----------------------------------------------------------------- context */

interface RoomSettingsContextValue {
  policy: RoomPolicyMap;
  profiles: RoomProfileMap;
  platform: PlatformSettings;
  gifts: GiftSettings;
  setPrivilege: <K extends keyof RoomPrivileges>(
    room: Tier,
    key: K,
    value: RoomPrivileges[K],
  ) => void;
  setProfileField: <K extends keyof RoomProfile>(
    room: Tier,
    key: K,
    value: RoomProfile[K],
  ) => void;
  setPlatformField: <K extends keyof PlatformSettings>(
    key: K,
    value: PlatformSettings[K],
  ) => void;
  setGiftField: <K extends keyof Gift>(giftId: string, key: K, value: Gift[K]) => void;
  setRoomGiftField: <K extends keyof RoomGiftRules>(
    room: Tier,
    key: K,
    value: RoomGiftRules[K],
  ) => void;
  toggleRoomGift: (room: Tier, giftId: string) => void;
  /** Gifts a given room may actually send right now, with admin values. */
  giftsFor: (room: Tier) => Gift[];
  giftRulesOf: (room: Tier) => RoomGiftRules;
  canCall: (room: Tier, feature: "audio" | "video") => boolean;
  can: (room: Tier, feature: BooleanPrivilege) => boolean;
  accentOf: (room: Tier) => RoomAccentId;
  profileOf: (room: Tier) => RoomProfile;
  resetPolicy: () => void;
}

const RoomSettingsContext = createContext<RoomSettingsContextValue | null>(null);

export function RoomSettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoredState>(DEFAULT_STATE);

  // Read after hydration so server and first client render match.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setState(sanitizeState(JSON.parse(raw)));
    } catch {
      /* ignore malformed storage */
    }

    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      try {
        setState(event.newValue ? sanitizeState(JSON.parse(event.newValue)) : DEFAULT_STATE);
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Mirror of state so writes happen outside the render phase.
  const stateRef = useRef(state);
  stateRef.current = state;

  const commit = useCallback((updater: (current: StoredState) => StoredState) => {
    const next = updater(stateRef.current);
    stateRef.current = next;
    setState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent(ROOM_SETTINGS_EVENT));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const setPrivilege = useCallback<RoomSettingsContextValue["setPrivilege"]>(
    (room, key, value) => {
      commit((current) => ({
        ...current,
        policy: { ...current.policy, [room]: { ...current.policy[room], [key]: value } },
      }));
    },
    [commit],
  );

  const setProfileField = useCallback<RoomSettingsContextValue["setProfileField"]>(
    (room, key, value) => {
      commit((current) => ({
        ...current,
        profiles: { ...current.profiles, [room]: { ...current.profiles[room], [key]: value } },
      }));
    },
    [commit],
  );

  const setPlatformField = useCallback<RoomSettingsContextValue["setPlatformField"]>(
    (key, value) => {
      commit((current) => ({ ...current, platform: { ...current.platform, [key]: value } }));
    },
    [commit],
  );

  const setGiftField = useCallback<RoomSettingsContextValue["setGiftField"]>(
    (giftId, key, value) => {
      commit((current) => ({
        ...current,
        gifts: {
          ...current.gifts,
          catalog: current.gifts.catalog.map((gift) =>
            gift.id === giftId ? { ...gift, [key]: value } : gift,
          ),
        },
      }));
    },
    [commit],
  );

  const setRoomGiftField = useCallback<RoomSettingsContextValue["setRoomGiftField"]>(
    (room, key, value) => {
      commit((current) => ({
        ...current,
        gifts: {
          ...current.gifts,
          rooms: { ...current.gifts.rooms, [room]: { ...current.gifts.rooms[room], [key]: value } },
        },
      }));
    },
    [commit],
  );

  const toggleRoomGift = useCallback<RoomSettingsContextValue["toggleRoomGift"]>(
    (room, giftId) => {
      commit((current) => {
        const rules = current.gifts.rooms[room];
        const giftIds = rules.giftIds.includes(giftId)
          ? rules.giftIds.filter((id) => id !== giftId)
          : [...rules.giftIds, giftId];
        return {
          ...current,
          gifts: {
            ...current.gifts,
            rooms: { ...current.gifts.rooms, [room]: { ...rules, giftIds } },
          },
        };
      });
    },
    [commit],
  );

  const resetPolicy = useCallback(() => {
    commit(() => DEFAULT_STATE);
  }, [commit]);

  const value = useMemo<RoomSettingsContextValue>(
    () => ({
      policy: state.policy,
      profiles: state.profiles,
      platform: state.platform,
      gifts: state.gifts,
      setPrivilege,
      setProfileField,
      setPlatformField,
      setGiftField,
      setRoomGiftField,
      toggleRoomGift,
      giftsFor: (room) => {
        const rules = state.gifts.rooms[room] ?? DEFAULT_ROOM_GIFT_RULES[room];
        if (!rules.enabled) return [];
        return state.gifts.catalog.filter(
          (gift) => gift.enabled && rules.giftIds.includes(gift.id),
        );
      },
      giftRulesOf: (room) => state.gifts.rooms[room] ?? DEFAULT_ROOM_GIFT_RULES[room],
      canCall: (room, feature) =>
        state.platform.callsEnabled && (state.policy[room]?.[feature] ?? false),
      can: (room, feature) => state.policy[room]?.[feature] ?? false,
      accentOf: (room) => state.policy[room]?.accent ?? "brass",
      profileOf: (room) => state.profiles[room] ?? DEFAULT_ROOM_PROFILES[room],
      resetPolicy,
    }),
    [
      state,
      setPrivilege,
      setProfileField,
      setPlatformField,
      setGiftField,
      setRoomGiftField,
      toggleRoomGift,
      resetPolicy,
    ],
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
