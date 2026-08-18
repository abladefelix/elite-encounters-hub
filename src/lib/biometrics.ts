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

/** Loads the Capacitor biometric plugin, but only inside the native shell. */
async function nativeBiometrics() {
  if (!isNativeApp()) return null;
  try {
    const mod = await import("@aparajita/capacitor-biometric-auth");
    return mod.BiometricAuth;
  } catch {
    return null;
  }
}

/** True when this device can do Face ID / Touch ID / fingerprint. */
export async function biometricsSupported(): Promise<boolean> {
  const native = await nativeBiometrics();
  if (!native) return false;
  try {
    const info = await native.checkBiometry();
    return Boolean(info.isAvailable);
  } catch {
    return false;
  }
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
  if (!(await biometricsSupported())) {
    throw new Error("This device does not offer Face ID, Touch ID or fingerprint unlock.");
  }
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
