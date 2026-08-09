import { useState } from "react";
import { MapPin, Crosshair, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useUpdateProfile } from "@/lib/queries";
import { requestBrowserLocation } from "@/lib/geo";

/**
 * Lets a member pin their working location from their own device so clients can
 * find them with the directory's "Near me" search. Coordinates are optional and
 * can be removed at any time.
 */
export function ServiceAreaCard({
  userId,
  latitude,
  longitude,
  updatedAt,
}: {
  userId: string;
  latitude: number | null;
  longitude: number | null;
  updatedAt: string | null;
}) {
  const updateProfile = useUpdateProfile();
  const [busy, setBusy] = useState(false);
  const pinned = typeof latitude === "number" && typeof longitude === "number";

  async function capture() {
    setBusy(true);
    try {
      const coords = await requestBrowserLocation();
      await updateProfile.mutateAsync({
        id: userId,
        patch: {
          latitude: coords.lat,
          longitude: coords.lng,
          location_updated_at: new Date().toISOString(),
        },
      });
      toast.success("Location pinned — you'll now show up in Near me searches.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save your location.");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      await updateProfile.mutateAsync({
        id: userId,
        patch: { latitude: null, longitude: null, location_updated_at: null },
      });
      toast.success("Location removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove your location.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-5 border-border/70 bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <MapPin className="mt-0.5 size-4 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-semibold">Location for “Near me”</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Pin the area you work from so members searching nearby can find you by distance. Your
            exact coordinates are never shown — only how far away you are.
          </p>

          <p className="mt-3 text-xs">
            {pinned ? (
              <span className="text-foreground">
                Pinned at {latitude!.toFixed(4)}, {longitude!.toFixed(4)}
                {updatedAt ? ` · updated ${new Date(updatedAt).toLocaleDateString()}` : ""}
              </span>
            ) : (
              <span className="text-muted-foreground">No location pinned yet.</span>
            )}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="brass" disabled={busy} onClick={capture}>
              <Crosshair className="size-4" /> {pinned ? "Update my location" : "Use my location"}
            </Button>
            {pinned ? (
              <Button size="sm" variant="soft" disabled={busy} onClick={clear}>
                <Trash2 className="size-4" /> Remove
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
