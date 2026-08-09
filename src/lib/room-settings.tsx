import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useSettingsSection } from "./platform-settings";
import { getPublicSettings } from "./public-settings.functions";
import {
  DEFAULT_GIFT_CATALOG,
  DEFAULT_ROOM_GIFT_RULES,
  type Gift,
  type RoomGiftRules,
  type RoomGiftRulesMap,
} from "./gifts";
import {
  DEFAULT_MODERATION_SETTINGS,
  type ModerationSettings,
} from "./moderation";
import { rooms } from "./mock-data";
import {
  ALL_TIERS,
  BASE_TIERS,
  CUSTOM_TIER_SLOTS,
  tierLabel,
  type CustomTier,
  type RoomMap,
  type Tier,
} from "./types";

/**
 * Room capability layer.
 *
 * Admins decide, per room, which features and privileges a subscription
 * unlocks — calls, sharing, scheduling windows, booking limits, cover — plus
 * the room's theme colour. All of this lives in the shared `platform_settings`
 * database row (via `useSettingsSection`), so a change in the admin dashboard
 * immediately changes what every member, on every device, sees and can do.
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

export type RoomPolicyMap = RoomMap<RoomPrivileges>;

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

export const TIERS: Tier[] = [...BASE_TIERS];

/** Privileges a freshly created room starts with — deliberately conservative. */
export const NEW_ROOM_PRIVILEGES: RoomPrivileges = {
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
  supportResponseHours: 24,
  damageCover: 0,
  accent: "emerald",
};

export const NEW_ROOM_GIFT_RULES: RoomGiftRules = {
  enabled: true,
  giftIds: [],
  allowCustom: false,
  minGift: 5,
  maxGift: 200,
};

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

export type RoomProfileMap = RoomMap<RoomProfile>;

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

/** Starting point for a room an admin creates in the control room. */
export const NEW_ROOM_PROFILE: RoomProfile = {
  name: "New Room",
  tagline: "",
  priceMonthly: 0,
  visitFeeMin: 0,
  visitFeeMax: 0,
  seatsLeft: 25,
  intakeOpen: false,
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
  defaultTheme: "light",
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

/** Kept for compatibility with code that still references it by name; no
 * longer used for persistence — everything lives in the database now. */
export const ROOM_SETTINGS_STORAGE_KEY = "ashnight-room-policy-v4";

/** Event fired whenever the admin room/platform settings change, so parts of
 * the app that live outside the React settings tree (e.g. the theme
 * provider, which must resolve a theme before first paint) can react without
 * needing the full query client. This is a live notification only — nothing
 * is ever persisted to it. */
export const ROOM_SETTINGS_EVENT = "ashnight-room-settings-change";

interface StoredState {
  policy: RoomPolicyMap;
  profiles: RoomProfileMap;
  platform: PlatformSettings;
  gifts: GiftSettings;
  moderation: ModerationSettings;
}

/** Shape of the "rooms" section of the shared settings row. Platform
 * settings live in their own "platform" section. */
interface RoomsSection {
  policy: RoomPolicyMap;
  profiles: RoomProfileMap;
  gifts: GiftSettings;
  moderation: ModerationSettings;
}

const DEFAULT_ROOMS_SECTION: RoomsSection = {
  policy: DEFAULT_ROOM_POLICY,
  profiles: DEFAULT_ROOM_PROFILES,
  gifts: DEFAULT_GIFT_SETTINGS,
  moderation: DEFAULT_MODERATION_SETTINGS,
};

function sanitizeModeration(value: unknown): ModerationSettings {
  const next: ModerationSettings = {
    ...DEFAULT_MODERATION_SETTINGS,
    flaggedWords: [...DEFAULT_MODERATION_SETTINGS.flaggedWords],
    contactExemptRooms: { ...DEFAULT_MODERATION_SETTINGS.contactExemptRooms },
  };
  if (!value || typeof value !== "object") return next;
  const record = value as Record<string, unknown>;

  for (const key of [
    "enabled",
    "blockPhoneNumbers",
    "blockContactSharing",
    "flaggedWordsEnabled",
    "scanImages",
    "notifyMember",
    "logHits",
  ] as const) {
    if (typeof record[key] === "boolean") next[key] = record[key] as boolean;
  }

  for (const key of ["phoneAction", "contactAction", "flaggedWordsAction", "imageAction"] as const) {
    const action = record[key];
    if (action === "warn" || action === "mask" || action === "block") next[key] = action;
  }

  if (Array.isArray(record["flaggedWords"])) {
    next.flaggedWords = (record["flaggedWords"] as unknown[])
      .filter((word): word is string => typeof word === "string")
      .map((word) => word.trim())
      .filter(Boolean);
  }

  const exempt = record["contactExemptRooms"];
  if (exempt && typeof exempt === "object") {
    for (const tier of ALL_TIERS) {
      const flag = (exempt as Record<string, unknown>)[tier];
      if (typeof flag === "boolean") next.contactExemptRooms[tier] = flag;
    }
  }
  return next;
}

function clampNumber(value: unknown, fallback: number, min = 0) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, value) : fallback;
}

function sanitizePolicy(value: unknown, customTiers: CustomTier[] = []): RoomPolicyMap {
  const next: RoomPolicyMap = {
    basic: { ...DEFAULT_ROOM_POLICY.basic },
    premium: { ...DEFAULT_ROOM_POLICY.premium },
    ultimate: { ...DEFAULT_ROOM_POLICY.ultimate },
  };
  for (const tier of customTiers) next[tier] = { ...NEW_ROOM_PRIVILEGES };
  if (!value || typeof value !== "object") return next;

  for (const tier of [...BASE_TIERS, ...customTiers]) {
    const entry = (value as Record<string, unknown>)[tier];
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const target = next[tier];
    if (!target) continue;

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

/** Custom room slots an admin has already created, in slot order. */
function storedCustomTiers(profilesValue: unknown): CustomTier[] {
  if (!profilesValue || typeof profilesValue !== "object") return [];
  const record = profilesValue as Record<string, unknown>;
  return CUSTOM_TIER_SLOTS.filter((slot) => {
    const entry = record[slot];
    return Boolean(entry) && typeof entry === "object";
  });
}

function sanitizeProfiles(value: unknown, customTiers: CustomTier[] = []): RoomProfileMap {
  const next: RoomProfileMap = {
    basic: { ...DEFAULT_ROOM_PROFILES.basic },
    premium: { ...DEFAULT_ROOM_PROFILES.premium },
    ultimate: { ...DEFAULT_ROOM_PROFILES.ultimate },
  };
  for (const tier of customTiers) next[tier] = { ...NEW_ROOM_PROFILE };
  if (!value || typeof value !== "object") return next;

  for (const tier of [...BASE_TIERS, ...customTiers]) {
    const entry = (value as Record<string, unknown>)[tier];
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const target = next[tier];
    if (!target) continue;

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

function sanitizeGifts(value: unknown, customTiers: CustomTier[] = []): GiftSettings {
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
  for (const tier of customTiers) roomsRules[tier] = { ...NEW_ROOM_GIFT_RULES, giftIds: [] };
  const next: GiftSettings = { catalog, rooms: roomsRules };
  if (!value || typeof value !== "object") return next;
  const record = value as Record<string, unknown>;

  const storedCatalog = record["catalog"];
  if (Array.isArray(storedCatalog)) {
    // Once the admin has saved a catalogue, it is the source of truth: gifts
    // they removed must not reappear from the shipping defaults.
    const keepIds = new Set(
      storedCatalog
        .map((raw) => (raw && typeof raw === "object" ? (raw as Record<string, unknown>)["id"] : null))
        .filter((id): id is string => typeof id === "string"),
    );
    for (let index = catalog.length - 1; index >= 0; index -= 1) {
      const gift = catalog[index];
      if (gift && !keepIds.has(gift.id)) catalog.splice(index, 1);
    }
    for (const raw of storedCatalog) {
      if (!raw || typeof raw !== "object") continue;
      const entry = raw as Record<string, unknown>;
      const id = typeof entry["id"] === "string" ? (entry["id"] as string) : "";
      if (!id) continue;
      let target = catalog.find((gift) => gift.id === id);
      if (!target) {
        // Admin-created gift — keep it, seeded from a sane default.
        target = { id, label: id, glyph: "🎁", value: 10, hint: "", enabled: true };
        catalog.push(target);
      }
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
    for (const tier of [...BASE_TIERS, ...customTiers]) {
      const raw = (storedRooms as Record<string, unknown>)[tier];
      if (!raw || typeof raw !== "object") continue;
      const entry = raw as Record<string, unknown>;
      const target = roomsRules[tier];
      if (!target) continue;
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

function sanitizeRoomsSection(value: unknown): RoomsSection {
  const record = (value ?? {}) as Record<string, unknown>;
  const customTiers = storedCustomTiers(record["profiles"]);
  return {
    policy: sanitizePolicy(record["policy"], customTiers),
    profiles: sanitizeProfiles(record["profiles"], customTiers),
    gifts: sanitizeGifts(record["gifts"], customTiers),
    moderation: sanitizeModeration(record["moderation"]),
  };
}

/** Rooms that exist right now, base rooms first then custom rooms in slot order. */
export function roomIdsOf(profiles: RoomProfileMap): Tier[] {
  return [...BASE_TIERS, ...CUSTOM_TIER_SLOTS.filter((slot) => Boolean(profiles[slot]))];
}

/* ------------------------------------------------- default-theme fast path */
//
// The theme provider must resolve a theme before first paint, synchronously,
// without waiting on React Query. We keep a tiny module-level cache fed by a
// one-off read plus a realtime subscription, so it stays in sync with the
// database without ever touching localStorage.

let cachedDefaultTheme: DefaultTheme = DEFAULT_PLATFORM_SETTINGS.defaultTheme;
let themeCacheInitialized = false;

function notifySettingsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ROOM_SETTINGS_EVENT));
}

function initThemeCache() {
  if (themeCacheInitialized || typeof window === "undefined") return;
  themeCacheInitialized = true;

  const applyPlatform = (data: unknown) => {
    const record = (data ?? {}) as Record<string, unknown>;
    const platform = sanitizePlatform(record["platform"]);
    if (platform.defaultTheme !== cachedDefaultTheme) {
      cachedDefaultTheme = platform.defaultTheme;
      notifySettingsChanged();
    }
  };

  // Signed-out visitors read the public settings slice instead of the full row.
  const readPlatform = async () => {
    const { data, error } = await supabase
      .from("platform_settings")
      .select("data")
      .eq("id", true)
      .maybeSingle();
    if (!error && data) return data.data;
    return ((await getPublicSettings()) as unknown) ?? null;
  };

  void readPlatform().then((data) => applyPlatform(data));

  supabase
    .channel("platform-settings-theme")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "platform_settings" },
      async () => {
        applyPlatform(await readPlatform());
      },
    )
    .subscribe();
}

/** Read the admin-chosen default theme without needing the React context. */
export function readDefaultTheme(): DefaultTheme {
  initThemeCache();
  return cachedDefaultTheme;
}

/* ----------------------------------------------------------------- context */

interface RoomSettingsContextValue {
  policy: RoomPolicyMap;
  profiles: RoomProfileMap;
  platform: PlatformSettings;
  gifts: GiftSettings;
  moderation: ModerationSettings;
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
  /** Rooms that exist right now, base rooms first. */
  roomIds: Tier[];
  /** Claim the next free room slot. Returns the new room id, or null if full. */
  createRoom: (input: { name: string; tagline?: string; priceMonthly?: number }) => Tier | null;
  /** Remove a custom room. Base rooms cannot be removed. */
  deleteRoom: (room: Tier) => void;
  /** Add a gift to the catalogue. Returns the new gift id, or null on clash. */
  addGift: (input: { label: string; glyph?: string; value: number; hint?: string }) => string | null;
  removeGift: (giftId: string) => void;
  setModerationField: <K extends keyof ModerationSettings>(
    key: K,
    value: ModerationSettings[K],
  ) => void;
  /** Replace the flagged-word list (already trimmed and de-duplicated). */
  setFlaggedWords: (words: string[]) => void;
  addFlaggedWord: (word: string) => void;
  removeFlaggedWord: (word: string) => void;
  setContactExemptRoom: (room: Tier, exempt: boolean) => void;
  /** Whether a room may exchange contact details right now. */
  contactSharingAllowed: (room: Tier) => boolean;
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

function reportSaveError(context: string) {
  return (error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    toast.error(`Could not save ${context}: ${message}`);
  };
}

export function RoomSettingsProvider({ children }: { children: ReactNode }) {
  const roomsSection = useSettingsSection<RoomsSection>("rooms", DEFAULT_ROOMS_SECTION);
  const platformSection = useSettingsSection<PlatformSettings>("platform", DEFAULT_PLATFORM_SETTINGS);

  const state = useMemo<StoredState>(() => {
    const rooms = sanitizeRoomsSection(roomsSection.value);
    return {
      policy: rooms.policy,
      profiles: rooms.profiles,
      gifts: rooms.gifts,
      moderation: rooms.moderation,
      platform: sanitizePlatform(platformSection.value),
    };
  }, [roomsSection.value, platformSection.value]);

  // Keep the module-level theme cache (used by readDefaultTheme) in sync with
  // whatever this provider already has loaded, and notify listeners such as
  // the theme provider.
  useEffect(() => {
    if (state.platform.defaultTheme !== cachedDefaultTheme) {
      cachedDefaultTheme = state.platform.defaultTheme;
      notifySettingsChanged();
    }
  }, [state.platform.defaultTheme]);

  const saveRooms = useCallback(
    (next: RoomsSection) => {
      void roomsSection.save(next).catch(reportSaveError("room settings"));
    },
    [roomsSection],
  );

  const savePlatform = useCallback(
    (next: PlatformSettings) => {
      void platformSection.save(next).catch(reportSaveError("platform settings"));
    },
    [platformSection],
  );

  const roomsBase = useCallback(
    (): RoomsSection => ({
      policy: state.policy,
      profiles: state.profiles,
      gifts: state.gifts,
      moderation: state.moderation,
    }),
    [state],
  );

  const setPrivilege = useCallback<RoomSettingsContextValue["setPrivilege"]>(
    (room, key, value) => {
      const base = roomsBase();
      saveRooms({
        ...base,
        policy: { ...base.policy, [room]: { ...(base.policy[room] ?? NEW_ROOM_PRIVILEGES), [key]: value } },
      });
    },
    [roomsBase, saveRooms],
  );

  const setProfileField = useCallback<RoomSettingsContextValue["setProfileField"]>(
    (room, key, value) => {
      const base = roomsBase();
      saveRooms({
        ...base,
        profiles: { ...base.profiles, [room]: { ...(base.profiles[room] ?? NEW_ROOM_PROFILE), [key]: value } },
      });
    },
    [roomsBase, saveRooms],
  );

  const setPlatformField = useCallback<RoomSettingsContextValue["setPlatformField"]>(
    (key, value) => {
      savePlatform({ ...state.platform, [key]: value });
    },
    [state.platform, savePlatform],
  );

  const setGiftField = useCallback<RoomSettingsContextValue["setGiftField"]>(
    (giftId, key, value) => {
      const base = roomsBase();
      saveRooms({
        ...base,
        gifts: {
          ...base.gifts,
          catalog: base.gifts.catalog.map((gift) =>
            gift.id === giftId ? { ...gift, [key]: value } : gift,
          ),
        },
      });
    },
    [roomsBase, saveRooms],
  );

  const setRoomGiftField = useCallback<RoomSettingsContextValue["setRoomGiftField"]>(
    (room, key, value) => {
      const base = roomsBase();
      saveRooms({
        ...base,
        gifts: {
          ...base.gifts,
          rooms: { ...base.gifts.rooms, [room]: { ...(base.gifts.rooms[room] ?? NEW_ROOM_GIFT_RULES), [key]: value } },
        },
      });
    },
    [roomsBase, saveRooms],
  );

  const toggleRoomGift = useCallback<RoomSettingsContextValue["toggleRoomGift"]>(
    (room, giftId) => {
      const base = roomsBase();
      const rules = base.gifts.rooms[room] ?? NEW_ROOM_GIFT_RULES;
      const giftIds = rules.giftIds.includes(giftId)
        ? rules.giftIds.filter((id) => id !== giftId)
        : [...rules.giftIds, giftId];
      saveRooms({
        ...base,
        gifts: {
          ...base.gifts,
          rooms: { ...base.gifts.rooms, [room]: { ...rules, giftIds } },
        },
      });
    },
    [roomsBase, saveRooms],
  );

  const roomIds = useMemo(() => roomIdsOf(state.profiles), [state.profiles]);

  const createRoom = useCallback<RoomSettingsContextValue["createRoom"]>(
    (input) => {
      const base = roomsBase();
      const slot = CUSTOM_TIER_SLOTS.find((candidate) => !base.profiles[candidate]);
      if (!slot) {
        toast.error("All room slots are in use — remove a custom room first.");
        return null;
      }
      const name = input.name.trim() || "New Room";
      saveRooms({
        ...base,
        profiles: {
          ...base.profiles,
          [slot]: {
            ...NEW_ROOM_PROFILE,
            name,
            tagline: input.tagline?.trim() ?? "",
            priceMonthly: Math.max(0, Math.round(input.priceMonthly ?? 0)),
          },
        },
        policy: { ...base.policy, [slot]: { ...NEW_ROOM_PRIVILEGES } },
        gifts: {
          ...base.gifts,
          rooms: { ...base.gifts.rooms, [slot]: { ...NEW_ROOM_GIFT_RULES } },
        },
      });
      return slot;
    },
    [roomsBase, saveRooms],
  );

  const deleteRoom = useCallback<RoomSettingsContextValue["deleteRoom"]>(
    (room) => {
      if ((BASE_TIERS as string[]).includes(room)) {
        toast.error("The three core rooms cannot be removed.");
        return;
      }
      const base = roomsBase();
      const profiles = { ...base.profiles };
      const policy = { ...base.policy };
      const giftRooms = { ...base.gifts.rooms };
      delete profiles[room as CustomTier];
      delete policy[room as CustomTier];
      delete giftRooms[room as CustomTier];
      saveRooms({
        ...base,
        profiles,
        policy,
        gifts: { ...base.gifts, rooms: giftRooms },
      });
    },
    [roomsBase, saveRooms],
  );

  const addGift = useCallback<RoomSettingsContextValue["addGift"]>(
    (input) => {
      const label = input.label.trim();
      if (!label) {
        toast.error("Give the gift a name.");
        return null;
      }
      const value = Math.round(input.value);
      if (!Number.isFinite(value) || value <= 0) {
        toast.error("A gift needs a cash value above zero.");
        return null;
      }
      const base = roomsBase();
      const slug =
        label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || `gift-${base.gifts.catalog.length + 1}`;
      let id = slug;
      let suffix = 2;
      while (base.gifts.catalog.some((gift) => gift.id === id)) {
        id = `${slug}-${suffix}`;
        suffix += 1;
      }
      saveRooms({
        ...base,
        gifts: {
          ...base.gifts,
          catalog: [
            ...base.gifts.catalog,
            {
              id,
              label,
              glyph: input.glyph?.trim() || "🎁",
              value,
              hint: input.hint?.trim() ?? "",
              enabled: true,
            },
          ],
        },
      });
      return id;
    },
    [roomsBase, saveRooms],
  );

  const removeGift = useCallback<RoomSettingsContextValue["removeGift"]>(
    (giftId) => {
      const base = roomsBase();
      const rooms = Object.fromEntries(
        Object.entries(base.gifts.rooms).map(([tier, rules]) => [
          tier,
          rules ? { ...rules, giftIds: rules.giftIds.filter((id) => id !== giftId) } : rules,
        ]),
      ) as RoomGiftRulesMap;
      saveRooms({
        ...base,
        gifts: {
          catalog: base.gifts.catalog.filter((gift) => gift.id !== giftId),
          rooms,
        },
      });
    },
    [roomsBase, saveRooms],
  );

  const setModerationField = useCallback<RoomSettingsContextValue["setModerationField"]>(
    (key, value) => {
      const base = roomsBase();
      saveRooms({ ...base, moderation: { ...base.moderation, [key]: value } });
    },
    [roomsBase, saveRooms],
  );

  const setFlaggedWords = useCallback<RoomSettingsContextValue["setFlaggedWords"]>(
    (words) => {
      const cleaned = [...new Set(words.map((word) => word.trim()).filter(Boolean))];
      const base = roomsBase();
      saveRooms({ ...base, moderation: { ...base.moderation, flaggedWords: cleaned } });
    },
    [roomsBase, saveRooms],
  );

  const addFlaggedWord = useCallback<RoomSettingsContextValue["addFlaggedWord"]>(
    (word) => {
      const term = word.trim();
      if (!term) return;
      const base = roomsBase();
      if (
        base.moderation.flaggedWords.some(
          (existing) => existing.toLowerCase() === term.toLowerCase(),
        )
      ) {
        return;
      }
      saveRooms({
        ...base,
        moderation: {
          ...base.moderation,
          flaggedWords: [...base.moderation.flaggedWords, term],
        },
      });
    },
    [roomsBase, saveRooms],
  );

  const removeFlaggedWord = useCallback<RoomSettingsContextValue["removeFlaggedWord"]>(
    (word) => {
      const base = roomsBase();
      saveRooms({
        ...base,
        moderation: {
          ...base.moderation,
          flaggedWords: base.moderation.flaggedWords.filter((existing) => existing !== word),
        },
      });
    },
    [roomsBase, saveRooms],
  );

  const setContactExemptRoom = useCallback<RoomSettingsContextValue["setContactExemptRoom"]>(
    (room, exempt) => {
      const base = roomsBase();
      saveRooms({
        ...base,
        moderation: {
          ...base.moderation,
          contactExemptRooms: { ...base.moderation.contactExemptRooms, [room]: exempt },
        },
      });
    },
    [roomsBase, saveRooms],
  );

  const resetPolicy = useCallback(() => {
    saveRooms(DEFAULT_ROOMS_SECTION);
    savePlatform(DEFAULT_PLATFORM_SETTINGS);
  }, [saveRooms, savePlatform]);

  const value = useMemo<RoomSettingsContextValue>(
    () => ({
      policy: state.policy,
      profiles: state.profiles,
      platform: state.platform,
      gifts: state.gifts,
      moderation: state.moderation,
      setPrivilege,
      setProfileField,
      setPlatformField,
      setGiftField,
      setRoomGiftField,
      toggleRoomGift,
      roomIds,
      createRoom,
      deleteRoom,
      addGift,
      removeGift,
      setModerationField,
      setFlaggedWords,
      addFlaggedWord,
      removeFlaggedWord,
      setContactExemptRoom,
      contactSharingAllowed: (room) =>
        !state.moderation.enabled ||
        (!state.moderation.blockContactSharing && !state.moderation.blockPhoneNumbers) ||
        (state.moderation.contactExemptRooms[room] ?? false),
      giftsFor: (room) => {
        const rules = state.gifts.rooms[room] ?? DEFAULT_ROOM_GIFT_RULES[room] ?? NEW_ROOM_GIFT_RULES;
        if (!rules.enabled) return [];
        return state.gifts.catalog.filter(
          (gift) => gift.enabled && rules.giftIds.includes(gift.id),
        );
      },
      giftRulesOf: (room) =>
        state.gifts.rooms[room] ?? DEFAULT_ROOM_GIFT_RULES[room] ?? NEW_ROOM_GIFT_RULES,
      canCall: (room, feature) =>
        state.platform.callsEnabled && (state.policy[room]?.[feature] ?? false),
      can: (room, feature) => state.policy[room]?.[feature] ?? false,
      accentOf: (room) => state.policy[room]?.accent ?? "brass",
      profileOf: (room) =>
        state.profiles[room] ?? DEFAULT_ROOM_PROFILES[room] ?? { ...NEW_ROOM_PROFILE, name: tierLabel(room) },
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
      roomIds,
      createRoom,
      deleteRoom,
      addGift,
      removeGift,
      setModerationField,
      setFlaggedWords,
      addFlaggedWord,
      removeFlaggedWord,
      setContactExemptRoom,
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
  return context?.accentOf(room) ?? DEFAULT_ROOM_POLICY[room]?.accent ?? "brass";
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
