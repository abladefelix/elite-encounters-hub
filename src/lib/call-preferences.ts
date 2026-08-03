/**
 * Per-member call preferences, stored on `profiles.extra` so a member owns them.
 *
 * Ringing while the app is fully closed needs an operating-system push (VoIP
 * push on iOS, FCM high-priority on Android). The web build and the current
 * native shell only ring while the app is open or backgrounded, so the
 * background switch records the member's choice and is honoured the moment the
 * native push service is live — it never silently pretends to work.
 */
export interface CallPreferences {
  /** Accept incoming voice/video calls at all. */
  acceptCalls: boolean;
  /** Ring when the app is closed or in the background (needs native push). */
  ringWhenClosed: boolean;
  /** Play a ringtone; off means silent banner only. */
  ringtone: boolean;
  /** Vibrate on incoming calls (native only). */
  vibrate: boolean;
}

export const DEFAULT_CALL_PREFERENCES: CallPreferences = {
  acceptCalls: true,
  ringWhenClosed: false,
  ringtone: true,
  vibrate: true,
};

/** Reads call preferences out of the loose `extra` JSON on a profile row. */
export function readCallPreferences(extra: unknown): CallPreferences {
  const source =
    extra && typeof extra === "object" && !Array.isArray(extra)
      ? ((extra as Record<string, unknown>)["calls"] as Record<string, unknown> | undefined)
      : undefined;
  if (!source) return { ...DEFAULT_CALL_PREFERENCES };
  const bool = (key: keyof CallPreferences) =>
    typeof source[key] === "boolean" ? (source[key] as boolean) : DEFAULT_CALL_PREFERENCES[key];
  return {
    acceptCalls: bool("acceptCalls"),
    ringWhenClosed: bool("ringWhenClosed"),
    ringtone: bool("ringtone"),
    vibrate: bool("vibrate"),
  };
}

/** Merges call preferences back into `extra` without dropping other keys. */
export function writeCallPreferences(extra: unknown, calls: CallPreferences) {
  const base =
    extra && typeof extra === "object" && !Array.isArray(extra)
      ? { ...(extra as Record<string, unknown>) }
      : {};
  return { ...base, calls };
}
