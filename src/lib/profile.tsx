/**
 * Member profile store.
 *
 * Everything a member can edit about themselves: avatar, identity, likes,
 * dislikes, the services they render (specialists) and personal preferences.
 * Persisted in localStorage; swap for a backend without touching the UI.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { currentClient } from "@/lib/mock-data";
import type { Tier } from "@/lib/types";

export type ProfileRole = "client" | "specialist";

export interface MemberProfile {
  role: ProfileRole;
  name: string;
  headline: string;
  city: string;
  phone: string;
  email: string;
  bio: string;
  /** Data URL of the uploaded avatar, or null for initials fallback. */
  avatar: string | null;
  likes: string[];
  dislikes: string[];
  /** Service ids from the admin catalogue this specialist renders. */
  serviceIds: string[];
  languages: string[];
  hourlyRate: number;
  yearsExperience: number;
  availability: string;
  room: Tier;
  preferences: {
    emailUpdates: boolean;
    smsAlerts: boolean;
    showOnlineStatus: boolean;
    allowCalls: boolean;
    showProfileInRoom: boolean;
  };
}

export const PROFILE_STORAGE_KEY = "ashnight-profile-v1";

export function defaultProfile(): MemberProfile {
  const me = currentClient();
  return {
    role: "client",
    name: me.name,
    headline: "Ashnight member",
    city: me.city,
    phone: "",
    email: "",
    bio: "",
    avatar: null,
    likes: ["Eco-friendly products", "Quiet mornings"],
    dislikes: ["Strong bleach smell", "Late arrivals"],
    serviceIds: [],
    languages: ["English"],
    hourlyRate: 70,
    yearsExperience: 3,
    availability: "Weekdays, 8am – 5pm",
    room: me.room,
    preferences: {
      emailUpdates: true,
      smsAlerts: false,
      showOnlineStatus: true,
      allowCalls: true,
      showProfileInRoom: true,
    },
  };
}

function strings(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 24);
}

function sanitize(value: unknown): MemberProfile {
  const base = defaultProfile();
  if (!value || typeof value !== "object") return base;
  const record = value as Record<string, unknown>;

  const next: MemberProfile = { ...base, preferences: { ...base.preferences } };
  if (record["role"] === "client" || record["role"] === "specialist") next.role = record["role"];
  for (const key of [
    "name",
    "headline",
    "city",
    "phone",
    "email",
    "bio",
    "availability",
  ] as const) {
    if (typeof record[key] === "string") next[key] = (record[key] as string).slice(0, 600);
  }
  if (typeof record["avatar"] === "string" && record["avatar"].startsWith("data:")) {
    next.avatar = record["avatar"];
  }
  next.likes = strings(record["likes"], base.likes);
  next.dislikes = strings(record["dislikes"], base.dislikes);
  next.serviceIds = strings(record["serviceIds"], base.serviceIds);
  next.languages = strings(record["languages"], base.languages);
  if (typeof record["hourlyRate"] === "number" && Number.isFinite(record["hourlyRate"])) {
    next.hourlyRate = Math.min(100000, Math.max(0, Math.round(record["hourlyRate"] as number)));
  }
  if (
    typeof record["yearsExperience"] === "number" &&
    Number.isFinite(record["yearsExperience"])
  ) {
    next.yearsExperience = Math.min(60, Math.max(0, Math.round(record["yearsExperience"] as number)));
  }
  if (record["room"] === "basic" || record["room"] === "premium" || record["room"] === "ultimate") {
    next.room = record["room"];
  }
  const prefs = record["preferences"];
  if (prefs && typeof prefs === "object") {
    for (const key of Object.keys(base.preferences) as (keyof MemberProfile["preferences"])[]) {
      const flag = (prefs as Record<string, unknown>)[key];
      if (typeof flag === "boolean") next.preferences[key] = flag;
    }
  }
  return next;
}

interface ProfileContextValue {
  profile: MemberProfile;
  updateProfile: (patch: Partial<MemberProfile>) => void;
  updatePreference: (key: keyof MemberProfile["preferences"], value: boolean) => void;
  resetProfile: () => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<MemberProfile>(defaultProfile);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
      if (raw) setProfile(sanitize(JSON.parse(raw)));
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  const ref = useRef(profile);
  ref.current = profile;

  const commit = useCallback((next: MemberProfile) => {
    setProfile(next);
    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage may be unavailable (e.g. large avatar) */
    }
  }, []);

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      updateProfile: (patch) => commit({ ...ref.current, ...patch }),
      updatePreference: (key, flag) =>
        commit({
          ...ref.current,
          preferences: { ...ref.current.preferences, [key]: flag },
        }),
      resetProfile: () => commit(defaultProfile()),
    }),
    [profile, commit],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) throw new Error("useProfile must be used inside <ProfileProvider>");
  return context;
}
