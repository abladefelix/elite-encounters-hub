import { useEffect, useState } from "react";

/**
 * Native shell detection.
 *
 * The web build must keep working exactly as before, so nothing here imports
 * Capacitor at module scope — we only look for the runtime globals the native
 * shell injects. Always false in a normal browser and during SSR.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function nativePlatform(): "ios" | "android" | "web" {
  if (typeof window === "undefined") return "web";
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const platform = cap?.getPlatform?.();
  return platform === "ios" || platform === "android" ? platform : "web";
}

/**
 * Hydration-safe hook: renders `false` on the server and first paint, then
 * flips to the real value once mounted.
 */
export function useIsNativeApp(): boolean {
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(isNativeApp());
  }, []);
  return native;
}
