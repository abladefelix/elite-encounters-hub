import { Fingerprint } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useIsNativeApp } from "@/lib/native";
import {
  biometricLockEnabled,
  biometricPluginInstalled,
  disableBiometricLock,
  enableBiometricLock,
} from "@/lib/biometrics";

/**
 * Per-device toggle for the Face ID / Touch ID / fingerprint lock. The state is
 * local to the device on purpose — enrolling on a phone must not lock a laptop.
 */
export function BiometricCard({ userLabel }: { userLabel: string }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [setupError, setSetupError] = useState("");
  const native = useIsNativeApp();

  useEffect(() => {
    setEnabled(biometricLockEnabled());
  }, []);

  async function toggle(next: boolean) {
    if (busy) return;
    const previous = enabled;
    setEnabled(next);
    setSetupError("");
    setBusy(true);
    try {
      if (next) {
        await enableBiometricLock(userLabel);
        toast.success("Biometric unlock is on for this device");
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
        (typeof nativeError?.code === "string" && `Device authentication failed (${nativeError.code}).`) ||
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
                ? "Confirm with Face ID, Touch ID or your device passcode."
                : enabled
                  ? "On for this device only."
                  : "Off — turn it on to verify with this device."}
          </p>
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
