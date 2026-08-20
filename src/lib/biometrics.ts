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
  /** What the OS says it has: faceId / touchId / fingerprint / none. */
  biometryType: string;
}

/** Loads the Capacitor biometric plugin, but only inside the native shell. */
async function nativeBiometrics() {
  if (!isNativeApp()) return null;
  // Do not use Capacitor.isPluginAvailable() here. This package registers an
  // iOS JavaScript implementation, which makes that API return true even when
  // the installed binary has no native plugin. In that case authenticate()
  // reaches the package's intentionally empty native fallback and appears to
  // succeed without ever showing Face ID.
  if (!nativeBiometricHeader()) return null;
  try {
    const mod = await import("@aparajita/capacitor-biometric-auth");
    return mod.BiometricAuth;
  } catch {
    return null;
  }
}

type NativePluginHeader = {
  name?: string;
  methods?: Array<{ name?: string; rtype?: string }>;
};

function nativeBiometricHeader(): NativePluginHeader | null {
  if (!isNativeApp()) return null;
  const cap = (window as unknown as { Capacitor?: { PluginHeaders?: NativePluginHeader[] } })
    .Capacitor;
  const header = cap?.PluginHeaders?.find((candidate) => candidate.name === "BiometricAuthNative");
  if (!header) return null;
  const methods = header.methods ?? [];
  const hasCheck = methods.some((method) => method.name === "checkBiometry");
  const hasAuthenticate = methods.some((method) => method.name === "internalAuthenticate");
  return hasCheck && hasAuthenticate ? header : null;
}

const AUTH_OPTIONS = {
  reason: "Unlock Ashnight",
  cancelTitle: "Cancel",
  allowDeviceCredential: true,
  iosFallbackTitle: "Use passcode",
  androidTitle: "Ashnight",
  androidSubtitle: "Verify to continue",
  androidConfirmationRequired: false,
};

async function authenticateDevice(reason: string): Promise<void> {
  const native = await nativeBiometrics();
  if (!native) {
    throw new Error(
      "This iPhone build does not contain the native biometric plugin. Sync the iOS project, then make a new Xcode build.",
    );
  }

  const options = { ...AUTH_OPTIONS, reason };
  // Once the native header has been verified, the package proxy routes this
  // through Capacitor's supported bridge and maps native errors correctly.
  biometricPromptActive = true;
  try {
    await native.authenticate(options);
  } finally {
    biometricPromptActive = false;
  }
}

/** Prevents a native prompt from being mistaken for the app going to sleep. */
export function isBiometricPromptActive(): boolean {
  return biometricPromptActive;
}

/**
 * Synchronous native registration check for settings UI. Do not gate the
 * switch on checkBiometry(): some iOS WebViews can leave that optional
 * capability query unresolved even though authenticate() works normally.
 */
export function biometricPluginInstalled(): boolean {
  return nativeBiometricHeader() !== null;
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
      biometryType: "none",
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
      biometryType: String(info.biometryType ?? "none"),
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
 * Enables the local lock for this installation.
 *
 * Face ID / Touch ID enrolment belongs to iOS and cannot be performed by an
 * app. Do not authenticate here: cancelling or an unavailable prompt used to
 * make the settings switch immediately roll back. The BiometricGate performs
 * the real OS verification when the app next opens or resumes.
 */
export async function enableBiometricLock(_userLabel: string): Promise<void> {
  const native = await nativeBiometrics();
  if (!native) {
    throw new Error(
      "This iPhone build does not contain the native biometric plugin. Sync the iOS project, then make a new Xcode build.",
    );
  }
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
