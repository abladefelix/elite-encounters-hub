import { Fingerprint } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useIsNativeApp } from "@/lib/native";
import {
  biometricLockEnabled,
  biometricsSupported,
  disableBiometricLock,
  enableBiometricLock,
} from "@/lib/biometrics";

/**
 * Per-device toggle for the Face ID / Touch ID / fingerprint lock. The state is
 * local to the device on purpose — enrolling on a phone must not lock a laptop.
 */
export function BiometricCard({ userLabel }: { userLabel: string }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const native = useIsNativeApp();

  useEffect(() => {
    void biometricsSupported().then(setSupported);
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Fingerprint className="size-4 text-primary" /> Biometric unlock
        </CardTitle>
        <CardDescription>
          Ask for Face ID, Touch ID or your fingerprint whenever Ashnight opens on this device.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {supported === false
            ? native
              ? "Add a fingerprint or Face ID in your phone's settings first, then switch this on."
              : "Biometric unlock works in the Ashnight app on your phone — this browser has no sensor Ashnight can use."
            : enabled
              ? "On for this device only."
              : "Off — the app opens straight into your session."}
        </p>
        <Switch
          checked={enabled}
          disabled={busy || supported !== true}
          onCheckedChange={(next) => void toggle(next)}
          aria-label="Biometric unlock"
        />
      </CardContent>
    </Card>
  );
}
