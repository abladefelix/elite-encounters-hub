import { Fingerprint, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import {
  biometricLockEnabled,
  disableBiometricLock,
  isBiometricPromptActive,
  onBiometricLockChange,
  verifyBiometric,
} from "@/lib/biometrics";

/**
 * Covers the app with a lock screen when the member has switched on device
 * biometrics. Nothing renders when the lock is off, so the web build and every
 * non-enrolled device behave exactly as before.
 */
export function BiometricGate() {
  const [locked, setLocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);

  const unlock = useCallback(async () => {
    setChecking(true);
    setFailed(false);
    const ok = await verifyBiometric();
    setChecking(false);
    if (ok) {
      setLocked(false);
      setFailed(false);
    } else {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!biometricLockEnabled()) return;
    setLocked(true);
    void unlock();
  }, [unlock]);

  // Re-lock when the app is sent to the background and brought back.
  useEffect(() => {
    if (!biometricLockEnabled()) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && !isBiometricPromptActive()) setLocked(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    document.documentElement.style.overflow = locked ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [locked]);

  if (!locked) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <BrandMark className="size-14" />
      <div className="space-y-2">
        <h1 className="text-lg font-semibold">Ashnight is locked</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          {failed
            ? "We could not verify you. Try again, or turn the lock off to sign in normally."
            : "Verify with Face ID, Touch ID or your fingerprint to continue."}
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <Button variant="brass" disabled={checking} onClick={() => void unlock()}>
          <Fingerprint className="size-4" />
          {checking ? "Waiting for the device…" : "Unlock"}
        </Button>
        {failed ? (
          <Button
            variant="ghost"
            onClick={() => {
              disableBiometricLock();
              setLocked(false);
            }}
          >
            <ShieldCheck className="size-4" /> Turn the lock off
          </Button>
        ) : null}
      </div>
    </div>
  );
}
