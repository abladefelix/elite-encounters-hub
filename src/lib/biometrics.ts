/**
 * Device biometric lock (Face ID / Touch ID / Android fingerprint).
 *
 * Implemented with WebAuthn platform authenticators, which is what both the iOS
 * and Android web views expose to Capacitor. It is a *local* lock: enrolling
 * stores a credential id in localStorage and every app start asks the device to
 * verify the owner before the UI is shown. No server round trip, so it never
 * changes who the Supabase session belongs to — it only guards this device.
 */
import { isNativeApp } from "@/lib/native";

const CRED_KEY = "ashnight:biometric-credential";
const ENABLED_KEY = "ashnight:biometric-enabled";

function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return buffer;
}

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
  if (native) {
    try {
      const info = await native.checkBiometry();
      return Boolean(info.isAvailable);
    } catch {
      return false;
    }
  }
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function biometricLockEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem(ENABLED_KEY) === "1" &&
    Boolean(window.localStorage.getItem(CRED_KEY))
  );
}

/** Enrols the device owner. Throws with a readable message when declined. */
export async function enableBiometricLock(userLabel: string): Promise<void> {
  if (!(await biometricsSupported())) {
    throw new Error("This device does not offer Face ID, Touch ID or fingerprint unlock.");
  }
  const native = await nativeBiometrics();
  if (native) {
    // The OS owns the enrolment, so we only need a successful prompt once and a
    // marker that this device opted in.
    await native.authenticate({
      reason: "Confirm it's you to turn on biometric unlock",
      cancelTitle: "Cancel",
      allowDeviceCredential: true,
      iosFallbackTitle: "Use passcode",
      androidTitle: "Ashnight",
      androidSubtitle: "Confirm it's you",
      androidConfirmationRequired: false,
    });
    window.localStorage.setItem(CRED_KEY, "native");
    window.localStorage.setItem(ENABLED_KEY, "1");
    return;
  }
  const challenge = window.crypto.getRandomValues(new Uint8Array(32));
  const userId = window.crypto.getRandomValues(new Uint8Array(16));
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Ashnight", id: window.location.hostname },
      user: { id: userId, name: userLabel, displayName: userLabel },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Biometric setup was cancelled.");
  window.localStorage.setItem(CRED_KEY, bufferToBase64(credential.rawId));
  window.localStorage.setItem(ENABLED_KEY, "1");
}

export function disableBiometricLock(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ENABLED_KEY);
  window.localStorage.removeItem(CRED_KEY);
}

/** Prompts for Face ID / fingerprint. Returns true only when verified. */
export async function verifyBiometric(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(CRED_KEY);
  if (!stored) return false;
  const native = await nativeBiometrics();
  if (native) {
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
  if (stored === "native") return false;
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: window.crypto.getRandomValues(new Uint8Array(32)),
        rpId: window.location.hostname,
        allowCredentials: [{ id: base64ToBuffer(stored), type: "public-key" }],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    return Boolean(assertion);
  } catch {
    return false;
  }
}
