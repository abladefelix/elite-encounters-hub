import { Fingerprint } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useIsNativeApp } from "@/lib/native";
import {
  biometricLockEnabled,
  biometricPluginInstalled,
  biometryStatus,
  disableBiometricLock,
  enableBiometricLock,
  testBiometricPrompt,
  type BiometryStatus,
} from "@/lib/biometrics";

/**
 * Per-device toggle for the Face ID / Touch ID / fingerprint lock. The state is
 * local to the device on purpose — enrolling on a phone must not lock a laptop.
 */
export function BiometricCard({ userLabel }: { userLabel: string }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [status, setStatus] = useState<BiometryStatus | null>(null);
  const native = useIsNativeApp();

  useEffect(() => {
    setEnabled(biometricLockEnabled());
    void biometryStatus().then(setStatus);
  }, []);

  async function testPrompt() {
    if (busy) return;
    setSetupError("");
    setBusy(true);
    try {
      await testBiometricPrompt();
      toast.success("Device verified you");
    } catch (error) {
      const fresh = await biometryStatus();
      setStatus(fresh);
      const nativeError = error as { message?: unknown; code?: unknown };
      const message =
        (typeof nativeError?.message === "string" && nativeError.message) ||
        (typeof nativeError?.code === "string" && `Native biometric error: ${nativeError.code}`) ||
        fresh.reason ||
        "The device prompt was cancelled or unavailable.";
      setSetupError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(next: boolean) {
    if (busy) return;
    const previous = enabled;
    setEnabled(next);
    setSetupError("");
    setBusy(true);
    try {
      if (next) {
        await enableBiometricLock(userLabel);
        toast.success("Device verified — biometric unlock is on");
      } else {
        disableBiometricLock();
        toast("Biometric unlock switched off");
      }
    } catch (error) {
      setEnabled(previous);
      const nativeError = error as { message?: unknown; reason?: unknown; code?: unknown };
      const message =
        (typeof nativeError?.message === "string" && nativeError.message) ||
        (typeof nativeError?.reason === "string" && nativeError.reason) ||
        (typeof nativeError?.code === "string" &&
          `Device authentication failed (${nativeError.code}).`) ||
        "Biometric setup failed. Check Face ID or fingerprint access in device settings.";
      setSetupError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  // Web build never offers this lock — the card only exists in the mobile app.
  if (!native) return null;

  const pluginInstalled = biometricPluginInstalled();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Fingerprint className="size-4 text-primary" /> Biometric unlock
        </CardTitle>
        <CardDescription>
          Ask for Face ID, Touch ID or your device passcode whenever Ashnight opens on this device.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {!pluginInstalled
              ? "This app build doesn't include biometric unlock — sync and reinstall the latest native build."
              : busy
                ? "Updating biometric unlock for this device."
                : enabled
                  ? "On for this device only — verification runs when the app next locks."
                  : "Off — turn it on and complete the device prompt."}
          </p>
          {status && !status.pluginMissing ? (
            <p className="text-xs text-muted-foreground">
              Device reports: {status.biometryType} · biometry{" "}
              {status.biometryAvailable ? "ready" : "unavailable"} · passcode{" "}
              {status.deviceIsSecure ? "set" : "not set"}
              {status.reason ? ` · ${status.reason}` : ""}
            </p>
          ) : null}
          {pluginInstalled ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void testPrompt()}
              disabled={busy}
              className="mt-1"
            >
              Test device prompt
            </Button>
          ) : null}
          {setupError ? (
            <p className="text-sm text-destructive" role="alert">
              {setupError}
            </p>
          ) : null}
        </div>
        <Switch
          checked={enabled}
          disabled={busy || !pluginInstalled}
          onCheckedChange={(next) => void toggle(next)}
          aria-label="Biometric unlock"
        />
      </CardContent>
    </Card>
  );
}
