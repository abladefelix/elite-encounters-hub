/**
 * Device biometric lock (Face ID / Touch ID / Android fingerprint).
 *
 * Native app only. The web build never offers or enforces this lock — every
 * function short-circuits in a browser, so nothing changes there.
 *
 * It is a *local* lock: the OS owns the enrolment, we only store a marker that
 * this device opted in and ask the OS to verify the owner before the UI shows.
 * No server round trip, so it never changes who the session belongs to.
 */
import { isNativeApp } from "@/lib/native";

const ENABLED_KEY = "ashnight:biometric-enabled";
const BIOMETRY_CHECK_TIMEOUT_MS = 5000;

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
}

/** Loads the Capacitor biometric plugin, but only inside the native shell. */
async function nativeBiometrics() {
  if (!isNativeApp()) return null;
  // The JS shim always imports fine; what matters is whether the installed
  // binary actually contains the native plugin. If it doesn't, every call
  // throws "not implemented", so treat it as missing up front.
  const cap = (window as unknown as { Capacitor?: { isPluginAvailable?: (n: string) => boolean } })
    .Capacitor;
  if (cap?.isPluginAvailable && !cap.isPluginAvailable("BiometricAuthNative")) return null;
  try {
    const mod = await import("@aparajita/capacitor-biometric-auth");
    return mod.BiometricAuth;
  } catch {
    return null;
  }
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error("The device biometric check did not respond. Try the switch directly."),
            ),
          milliseconds,
        );
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
  const native = await nativeBiometrics();
  if (!native) {
    return {
      usable: false,
      biometryAvailable: false,
      deviceIsSecure: false,
      reason: "Biometric unlock is only available in the Ashnight mobile app.",
      pluginMissing: true,
    };
  }
  try {
    const info = await withTimeout(native.checkBiometry(), BIOMETRY_CHECK_TIMEOUT_MS);
    const biometryAvailable = Boolean(info.isAvailable);
    const deviceIsSecure = Boolean(info.deviceIsSecure);
    return {
      usable: biometryAvailable || deviceIsSecure,
      biometryAvailable,
      deviceIsSecure,
      reason:
        info.reason ||
        (biometryAvailable
          ? ""
          : deviceIsSecure
            ? "No fingerprint or Face ID enrolled — your device passcode will be used instead."
            : "Set a passcode and enrol Face ID or a fingerprint in your device settings first."),
      pluginMissing: false,
    };
  } catch (error) {
    return {
      usable: false,
      biometryAvailable: false,
      deviceIsSecure: false,
      reason:
        error instanceof Error ? error.message : "The device could not report its biometrics.",
      pluginMissing: false,
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

/** Enrols the device owner. Throws with a readable message when declined. */
export async function enableBiometricLock(_userLabel: string): Promise<void> {
  const native = await nativeBiometrics();
  if (!native) {
    throw new Error("Biometric unlock is only available in the Ashnight mobile app.");
  }
  // Authenticate directly instead of requiring checkBiometry() first. On a
  // small number of iOS/WebView combinations the capability check can stall,
  // while LocalAuthentication itself still responds correctly.
  await native.authenticate({
    reason: "Confirm it's you to turn on biometric unlock",
    cancelTitle: "Cancel",
    allowDeviceCredential: true,
    iosFallbackTitle: "Use passcode",
    androidTitle: "Ashnight",
    androidSubtitle: "Confirm it's you",
    androidConfirmationRequired: false,
  });
  window.localStorage.setItem(ENABLED_KEY, "1");
}

export function disableBiometricLock(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ENABLED_KEY);
}

/** Prompts for Face ID / fingerprint. Returns true only when verified. */
export async function verifyBiometric(): Promise<boolean> {
  const native = await nativeBiometrics();
  if (!native) return false;
  try {
    await native.authenticate({
      reason: "Unlock Ashnight",
      cancelTitle: "Cancel",
      allowDeviceCredential: true,
      iosFallbackTitle: "Use passcode",
      androidTitle: "Ashnight",
      androidSubtitle: "Verify to continue",
      androidConfirmationRequired: false,
    });
    return true;
  } catch {
    return false;
  }
}
