/**
 * Live connection awareness for Ashnight.
 *
 * Tracks three things members actually feel:
 *  - offline / back online (browser events, plus a real request probe because
 *    `navigator.onLine` lies on captive portals and flaky mobile data)
 *  - connection quality (round-trip latency to our own origin)
 *  - whether the last probe failed, so the UI can say "we can't reach Ashnight"
 *    instead of leaving spinners running forever.
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

export type ConnectionQuality = "good" | "fair" | "poor" | "offline";

export interface NetworkStatus {
  online: boolean;
  /** Round-trip time of the last successful probe, in ms. */
  latency: number | null;
  quality: ConnectionQuality;
  /** True when the browser reports a slow radio (2g/3g) or save-data mode. */
  saveData: boolean;
  /** Re-run the probe now (used by "Try again" buttons). */
  check: () => Promise<boolean>;
}

const PROBE_PATH = "/favicon.png";
const PROBE_TIMEOUT_MS = 8_000;
const PROBE_INTERVAL_MS = 25_000;
const FAIR_MS = 700;
const POOR_MS = 1_800;

async function probe(): Promise<number | null> {
  if (typeof window === "undefined") return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const started = performance.now();
  try {
    await fetch(`${PROBE_PATH}?_=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return Math.round(performance.now() - started);
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

function readEffective(): { saveData: boolean; slowRadio: boolean } {
  const connection = (
    navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean };
    }
  ).connection;
  const type = connection?.effectiveType ?? "";
  return {
    saveData: Boolean(connection?.saveData),
    slowRadio: type === "slow-2g" || type === "2g" || type === "3g",
  };
}

const NetworkContext = createContext<NetworkStatus | undefined>(undefined);

export function NetworkStatusProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [latency, setLatency] = useState<number | null>(null);
  const [radio, setRadio] = useState({ saveData: false, slowRadio: false });
  const running = useRef(false);

  const check = useCallback(async () => {
    if (running.current) return online;
    running.current = true;
    try {
      const result = await probe();
      setLatency(result);
      setOnline(result !== null);
      return result !== null;
    } finally {
      running.current = false;
    }
  }, [online]);

  useEffect(() => {
    setOnline(navigator.onLine);
    setRadio(readEffective());
    void check();

    const goOnline = () => void check();
    const goOffline = () => {
      setOnline(false);
      setLatency(null);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    document.addEventListener("visibilitychange", onVisible);

    const connection = (
      navigator as Navigator & { connection?: EventTarget }
    ).connection;
    const onChange = () => setRadio(readEffective());
    connection?.addEventListener?.("change", onChange);

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, PROBE_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", onVisible);
      connection?.removeEventListener?.("change", onChange);
      window.clearInterval(interval);
    };
  }, [check]);

  const value = useMemo<NetworkStatus>(() => {
    let quality: ConnectionQuality = "good";
    if (!online) quality = "offline";
    else if (latency !== null && latency >= POOR_MS) quality = "poor";
    else if ((latency !== null && latency >= FAIR_MS) || radio.slowRadio) quality = "fair";
    return { online, latency, quality, saveData: radio.saveData, check };
  }, [online, latency, radio, check]);

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetworkStatus(): NetworkStatus {
  return (
    useContext(NetworkContext) ?? {
      online: true,
      latency: null,
      quality: "good",
      saveData: false,
      check: async () => true,
    }
  );
}
