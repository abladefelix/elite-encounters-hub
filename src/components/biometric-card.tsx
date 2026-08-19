import { Fingerprint } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useIsNativeApp } from "@/lib/native";
import {
  biometricLockEnabled,
  biometryStatus,
  disableBiometricLock,
  enableBiometricLock,
  type BiometryStatus,
} from "@/lib/biometrics";

/**
 * Per-device toggle for the Face ID / Touch ID / fingerprint lock. The state is
 * local to the device on purpose — enrolling on a phone must not lock a laptop.
 */
export function BiometricCard({ userLabel }: { userLabel: string }) {
  const [status, setStatus] = useState<BiometryStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const native = useIsNativeApp();

  useEffect(() => {
    let active = true;
    void biometryStatus().then((nextStatus) => {
      if (active) setStatus(nextStatus);
    });
    setEnabled(biometricLockEnabled());
    return () => {
      active = false;
    };
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

  // If the plugin exists but its preliminary capability check times out, keep
  // the switch available: the OS authentication prompt is the authoritative
  // test and will return a readable error when the device is not configured.
  const usable = status?.usable === true || (status !== null && !status.pluginMissing);

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
          {status === null
            ? "Checking this device…"
            : status.pluginMissing
              ? "This build of the app doesn't include the unlock module yet — reinstall the latest app build."
              : !usable
                ? status.reason
                : enabled
                  ? status.biometryAvailable
                    ? "On for this device only."
                    : "On for this device — your device passcode will be used."
                  : "Off — the app opens straight into your session."}
        </p>
        <Switch
          checked={enabled}
          disabled={busy || !usable}
          onCheckedChange={(next) => void toggle(next)}
          aria-label="Biometric unlock"
        />
      </CardContent>
    </Card>
  );
}
