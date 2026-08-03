/**
 * Presence heartbeat.
 *
 * Availability has two halves: the switch a member flips in their profile, and
 * whether their device is actually reachable right now. This module owns the
 * second half.
 *
 * While the app is open we join one shared Realtime presence channel and send a
 * heartbeat, and we write `last_seen_at` on the member's own profile row every
 * couple of minutes so the signal survives a full reload. Realtime removes a
 * member from presence the moment their socket drops (closed tab, dead network,
 * phone asleep), so everyone else sees them as offline without any polling —
 * their "Available now" badge falls back to a reply estimate automatically.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const PRESENCE_TOPIC = "ashnight-presence";
/** How often we refresh `last_seen_at` in the database. */
const HEARTBEAT_MS = 120_000;
/** A stored `last_seen_at` older than this counts as offline. */
export const STALE_AFTER_MS = 5 * 60_000;

interface PresenceState {
  /** User ids currently connected to Ashnight on any device. */
  online: ReadonlySet<string>;
  /** True once the presence channel has synced at least once. */
  ready: boolean;
}

const PresenceContext = createContext<PresenceState>({ online: new Set(), ready: false });

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [online, setOnline] = useState<ReadonlySet<string>>(new Set());
  const [ready, setReady] = useState(false);
  const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!userId) {
      setOnline(new Set());
      setReady(false);
      return;
    }

    const channel = supabase.channel(PRESENCE_TOPIC, {
      config: { presence: { key: userId } },
    });

    const sync = () => {
      const state = channel.presenceState<{ user_id?: string }>();
      const ids = new Set<string>();
      for (const [key, entries] of Object.entries(state)) {
        ids.add(key);
        for (const entry of entries) if (entry.user_id) ids.add(entry.user_id);
      }
      setOnline(ids);
      setReady(true);
    };

    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ user_id: userId, at: new Date().toISOString() });
        }
      });

    const touch = () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      void supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", userId)
        .then(() => undefined);
    };

    touch();
    heartbeat.current = setInterval(touch, HEARTBEAT_MS);

    // Coming back from a locked phone or a dropped network re-announces us
    // immediately instead of waiting for the next heartbeat tick.
    const revive = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void channel.track({ user_id: userId, at: new Date().toISOString() });
      touch();
    };
    const retire = () => {
      void channel.untrack();
    };

    window.addEventListener("online", revive);
    window.addEventListener("focus", revive);
    document.addEventListener("visibilitychange", revive);
    window.addEventListener("offline", retire);
    window.addEventListener("pagehide", retire);

    return () => {
      if (heartbeat.current) clearInterval(heartbeat.current);
      heartbeat.current = null;
      window.removeEventListener("online", revive);
      window.removeEventListener("focus", revive);
      document.removeEventListener("visibilitychange", revive);
      window.removeEventListener("offline", retire);
      window.removeEventListener("pagehide", retire);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const value = useMemo<PresenceState>(() => ({ online, ready }), [online, ready]);

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function usePresence() {
  return useContext(PresenceContext);
}

/**
 * Whether a member's device is reachable. Live presence wins; when presence has
 * nothing on them we fall back to a recent `last_seen_at` heartbeat so a member
 * mid-reconnect isn't flashed offline.
 */
export function useIsOnline(memberId: string | undefined, lastSeenAt?: string | null) {
  const { online, ready } = usePresence();
  return computeOnline(memberId, lastSeenAt, online, ready);
}

function computeOnline(
  memberId: string | undefined,
  lastSeenAt: string | null | undefined,
  online: ReadonlySet<string>,
  ready: boolean,
) {
  if (!memberId) return false;
  if (online.has(memberId)) return true;
  if (!ready) return isFresh(lastSeenAt);
  return false;
}

export function isFresh(lastSeenAt: string | null | undefined) {
  if (!lastSeenAt) return false;
  const seen = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seen)) return false;
  return Date.now() - seen < STALE_AFTER_MS;
}
