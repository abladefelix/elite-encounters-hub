/**
 * Device biometric lock (Face ID / Touch ID / Android fingerprint).
 *
 * Native app only. The web build never offers or enforces this lock — every
 * function short-circuits in a browser, so nothing changes there.
 *
 * Follows Apple's current LocalAuthentication guidance, which the plugin
 * implements natively:
 *  - ask the OS for availability (`isAvailable`) purely to explain state,
 *  - never treat availability as authentication: always evaluate the policy,
 *  - allow the device passcode as the documented fallback,
 *  - surface the OS error (cancel, lockout, not enrolled) verbatim.
 *
 * It is a *local* lock: the OS owns the enrolment, we only store a marker that
 * this device opted in and ask the OS to verify the owner before the UI shows.
 */
import { BiometryType, NativeBiometric } from "@capgo/capacitor-native-biometric";

import { isNativeApp } from "@/lib/native";

const ENABLED_KEY = "ashnight:biometric-enabled";
const BIOMETRY_CHECK_TIMEOUT_MS = 8000;
let biometricPromptActive = false;

export interface BiometryStatus {
  /** True when the lock can be switched on (biometry enrolled, or a device passcode exists). */
  usable: boolean;
  /** True when the OS reports enrolled biometry (Face ID / Touch ID / fingerprint). */
  biometryAvailable: boolean;
  /** True when the device has a passcode / PIN / pattern — usable as a fallback. */
  deviceIsSecure: boolean;
  /** Human-readable reason from the OS when biometry is unavailable. */
  reason: string;
  /** True when the native plugin isn't in the installed binary at all. */
  pluginMissing: boolean;
  /** What the OS says it has: Face ID / Touch ID / fingerprint / none. */
  biometryType: string;
}

const TYPE_LABELS: Record<number, string> = {
  [BiometryType.NONE]: "none",
  [BiometryType.TOUCH_ID]: "Touch ID",
  [BiometryType.FACE_ID]: "Face ID",
  [BiometryType.FINGERPRINT]: "fingerprint",
  [BiometryType.FACE_AUTHENTICATION]: "face unlock",
  [BiometryType.IRIS_AUTHENTICATION]: "iris",
  [BiometryType.MULTIPLE]: "multiple biometrics",
  [BiometryType.DEVICE_CREDENTIAL]: "device passcode",
};

/** True when the native plugin is present in the installed binary. */
export function biometricPluginInstalled(): boolean {
  if (!isNativeApp()) return false;
  const cap = (
    window as unknown as {
      Capacitor?: { PluginHeaders?: Array<{ name?: string }>; isPluginAvailable?: (n: string) => boolean };
    }
  ).Capacitor;
  if (!cap) return false;
  // PluginHeaders only lists plugins compiled into the binary, so it is the
  // authoritative signal. Fall back to isPluginAvailable on older bridges.
  const headers = cap.PluginHeaders;
  if (Array.isArray(headers)) {
    return headers.some((header) => header.name === "NativeBiometric");
  }
  return cap.isPluginAvailable?.("NativeBiometric") === true;
}

const MISSING_PLUGIN_MESSAGE =
  "This app build does not include biometric unlock. Run the mobile sync and install a fresh native build.";

async function authenticateDevice(reason: string): Promise<void> {
  if (!biometricPluginInstalled()) throw new Error(MISSING_PLUGIN_MESSAGE);

  biometricPromptActive = true;
  try {
    // No timeout wrapper here: Apple's prompt is modal and may legitimately
    // stay open for as long as the person needs. The OS always settles it.
    await NativeBiometric.verifyIdentity({
      reason,
      title: "Ashnight",
      subtitle: reason,
      description: "",
      useFallback: true,
      fallbackTitle: "Use passcode",
      maxAttempts: 3,
    });
  } finally {
    biometricPromptActive = false;
  }
}

/** Prevents a native prompt from being mistaken for the app going to sleep. */
export function isBiometricPromptActive(): boolean {
  return biometricPromptActive;
}

async function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  timeoutMessage: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Full picture of what this device can do. The card uses it to explain *why*
 * the toggle is off instead of just greying it out with no reason.
 */
export async function biometryStatus(): Promise<BiometryStatus> {
  if (!biometricPluginInstalled()) {
    return {
      usable: false,
      biometryAvailable: false,
      deviceIsSecure: false,
      reason: isNativeApp()
        ? MISSING_PLUGIN_MESSAGE
        : "Biometric unlock is only available in the Ashnight mobile app.",
      pluginMissing: true,
      biometryType: "none",
    };
  }
  try {
    const info = await withTimeout(
      NativeBiometric.isAvailable({ useFallback: true }),
      BIOMETRY_CHECK_TIMEOUT_MS,
      "The device biometric check did not respond.",
    );
    const biometryAvailable = Boolean(info.strongBiometryIsAvailable);
    const deviceIsSecure = Boolean(info.deviceIsSecure);
    return {
      usable: Boolean(info.isAvailable) || biometryAvailable || deviceIsSecure,
      biometryAvailable,
      deviceIsSecure,
      reason:
        info.errorCode && !info.isAvailable
          ? String(info.errorCode)
          : biometryAvailable
            ? ""
            : deviceIsSecure
              ? "No Face ID or fingerprint enrolled — your device passcode will be used instead."
              : "Set a passcode and enrol Face ID or a fingerprint in your device settings first.",
      pluginMissing: false,
      biometryType: TYPE_LABELS[info.biometryType as number] ?? "unknown",
    };
  } catch (error) {
    return {
      usable: false,
      biometryAvailable: false,
      deviceIsSecure: false,
      reason:
        error instanceof Error ? error.message : "The device could not report its biometrics.",
      pluginMissing: false,
      biometryType: "unknown",
    };
  }
}

/** True when this device can do Face ID / Touch ID / fingerprint (or passcode fallback). */
export async function biometricsSupported(): Promise<boolean> {
  const status = await biometryStatus();
  return status.usable;
}

export function biometricLockEnabled(): boolean {
  if (typeof window === "undefined" || !isNativeApp()) return false;
  return window.localStorage.getItem(ENABLED_KEY) === "1";
}

/**
 * Enables the local lock for this installation. One successful OS evaluation is
 * required first, so the switch can never claim to be on while the native
 * bridge or the device setup is broken.
 */
export async function enableBiometricLock(_userLabel: string): Promise<void> {
  await authenticateDevice("Enable biometric unlock for Ashnight");
  window.localStorage.setItem(ENABLED_KEY, "1");
}

export function disableBiometricLock(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ENABLED_KEY);
}

/** Prompts for Face ID / fingerprint. Returns true only when verified. */
export async function verifyBiometric(): Promise<boolean> {
  try {
    await authenticateDevice("Unlock Ashnight");
    return true;
  } catch {
    return false;
  }
}

/** Settings-only test which preserves the native error for on-screen diagnosis. */
export async function testBiometricPrompt(): Promise<void> {
  await authenticateDevice("Test Face ID or Touch ID for Ashnight");
}
