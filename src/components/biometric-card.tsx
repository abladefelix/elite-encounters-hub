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
  const native = useIsNativeApp();

  useEffect(() => {
    setEnabled(biometricLockEnabled());
  }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      if (next) {
        await enableBiometricLock(userLabel);
        setEnabled(true);
        toast.success("Biometric unlock is on for this device");
      } else {
        disableBiometricLock();
        setEnabled(false);
        toast("Biometric unlock switched off");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Biometric setup failed.");
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
      <CardContent className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {!pluginInstalled
            ? "This app build doesn't include biometric unlock — sync and reinstall the latest native build."
            : enabled
              ? "On for this device only."
              : "Off — turn it on to verify with this device."}
        </p>
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
