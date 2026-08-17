/**
 * Tells members what's happening with their connection instead of leaving them
 * staring at a stalled screen: a sticky bar while offline, a one-off nudge when
 * the line is slow, and a quiet "back online" confirmation.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Gauge, WifiOff } from "lucide-react";

import { useNetworkStatus } from "@/lib/network-status";

const SLOW_TOAST_COOLDOWN_MS = 120_000;

export function ConnectionWatcher() {
  const { online, quality, latency, check } = useNetworkStatus();
  const wasOffline = useRef(false);
  const lastSlowToast = useRef(0);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      toast.success("Back online", {
        id: "connection",
        description: "Your connection is restored. Anything unsent can be tried again.",
      });
    }
  }, [online]);

  useEffect(() => {
    if (!online || (quality !== "poor" && quality !== "fair")) return;
    const now = Date.now();
    if (now - lastSlowToast.current < SLOW_TOAST_COOLDOWN_MS) return;
    lastSlowToast.current = now;
    toast.warning(quality === "poor" ? "Your connection is very slow" : "Slow connection", {
      id: "connection-slow",
      description:
        quality === "poor"
          ? "Photos, calls and payments may fail right now. Move to a stronger signal if you can."
          : "Things may take a little longer than usual to load.",
      duration: 6_000,
    });
  }, [online, quality]);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[95] flex items-center justify-center gap-3 border-b border-border/60 bg-destructive/95 px-4 py-2 text-xs font-medium text-destructive-foreground"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <WifiOff className="size-4 shrink-0" />
      <span>No internet connection. We'll reconnect automatically.</span>
      <button
        type="button"
        disabled={checking}
        onClick={async () => {
          setChecking(true);
          await check();
          setChecking(false);
        }}
        className="rounded-full bg-background/20 px-3 py-1 font-semibold disabled:opacity-60"
      >
        {checking ? "Checking…" : "Retry"}
      </button>
    </div>
  );
}

/** Small inline pill any page can drop in to show live connection quality. */
export function ConnectionQualityPill({ className }: { className?: string }) {
  const { quality, latency } = useNetworkStatus();
  if (quality === "good") return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[0.7rem] font-medium text-muted-foreground ${className ?? ""}`}
    >
      <Gauge className="size-3.5" />
      {quality === "offline" ? "Offline" : quality === "poor" ? "Very slow" : "Slow"}
      {latency !== null && quality !== "offline" ? ` · ${latency}ms` : ""}
    </span>
  );
}
