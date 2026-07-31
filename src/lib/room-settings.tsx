import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { Tier } from "./types";

/**
 * Room capability layer.
 *
 * Admins decide, per room, whether members can place voice and/or video calls
 * from a chat thread. The client app reads the same store, so a toggle in the
 * admin dashboard immediately changes what members can do in Messages.
 *
 * Persisted in localStorage today; swap `read`/`write` for backend calls later.
 */

export interface RoomCallPolicy {
  audio: boolean;
  video: boolean;
}

export type CallPolicyMap = Record<Tier, RoomCallPolicy>;

export const DEFAULT_CALL_POLICY: CallPolicyMap = {
  basic: { audio: true, video: false },
  premium: { audio: true, video: true },
  ultimate: { audio: true, video: true },
};

const STORAGE_KEY = "ashnight-room-call-policy";

function sanitize(value: unknown): CallPolicyMap {
  const next: CallPolicyMap = {
    basic: { ...DEFAULT_CALL_POLICY.basic },
    premium: { ...DEFAULT_CALL_POLICY.premium },
    ultimate: { ...DEFAULT_CALL_POLICY.ultimate },
  };
  if (!value || typeof value !== "object") return next;
  for (const tier of ["basic", "premium", "ultimate"] as Tier[]) {
    const entry = (value as Record<string, unknown>)[tier];
    if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      if (typeof record["audio"] === "boolean") next[tier].audio = record["audio"];
      if (typeof record["video"] === "boolean") next[tier].video = record["video"];
    }
  }
  return next;
}

interface RoomSettingsContextValue {
  callPolicy: CallPolicyMap;
  setCallFeature: (room: Tier, feature: keyof RoomCallPolicy, enabled: boolean) => void;
  canCall: (room: Tier, feature: keyof RoomCallPolicy) => boolean;
  resetCallPolicy: () => void;
}

const RoomSettingsContext = createContext<RoomSettingsContextValue | null>(null);

export function RoomSettingsProvider({ children }: { children: ReactNode }) {
  const [callPolicy, setCallPolicy] = useState<CallPolicyMap>(DEFAULT_CALL_POLICY);

  // Read after hydration so server and first client render match.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setCallPolicy(sanitize(JSON.parse(raw)));
    } catch {
      /* ignore malformed storage */
    }

    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      try {
        setCallPolicy(event.newValue ? sanitize(JSON.parse(event.newValue)) : DEFAULT_CALL_POLICY);
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persist = useCallback((next: CallPolicyMap) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const setCallFeature = useCallback<RoomSettingsContextValue["setCallFeature"]>(
    (room, feature, enabled) => {
      setCallPolicy((current) => {
        const next: CallPolicyMap = {
          ...current,
          [room]: { ...current[room], [feature]: enabled },
        };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const resetCallPolicy = useCallback(() => {
    setCallPolicy(DEFAULT_CALL_POLICY);
    persist(DEFAULT_CALL_POLICY);
  }, [persist]);

  const value = useMemo<RoomSettingsContextValue>(
    () => ({
      callPolicy,
      setCallFeature,
      canCall: (room, feature) => callPolicy[room]?.[feature] ?? false,
      resetCallPolicy,
    }),
    [callPolicy, setCallFeature, resetCallPolicy],
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
