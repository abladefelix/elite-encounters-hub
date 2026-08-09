/**
 * Distance helpers for the "Near me" search.
 *
 * Coordinates live on `profiles.latitude` / `profiles.longitude`; specialists
 * set them from their own device on /profile. Everything here is pure maths so
 * the directory can sort and filter without an extra round trip.
 */

export interface Coords {
  lat: number;
  lng: number;
  /** Browser-reported 68% confidence radius in metres. */
  accuracy?: number;
}

/** Radius options (km) offered in the directory's "Near me" control. */
export const NEAR_ME_RADII = [2, 5, 10, 25, 50, 100] as const;
export type NearMeRadius = (typeof NEAR_ME_RADII)[number];

const EARTH_RADIUS_KM = 6371;
const toRad = (value: number) => (value * Math.PI) / 180;

/** Great-circle distance in kilometres between two points. */
export function distanceKm(a: Coords, b: Coords): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isCoords(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

export function coordsOf(row: {
  latitude?: number | null;
  longitude?: number | null;
}): Coords | null {
  return isCoords(row.latitude, row.longitude)
    ? { lat: row.latitude as number, lng: row.longitude as number }
    : null;
}

/** Friendly distance label: metres under 1 km, then one decimal, then whole km. */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m away`;
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}

/**
 * Waits briefly for GPS to warm up and returns the most accurate reading.
 * Mobile browsers often emit a coarse network position first, followed by a
 * much better GPS fix; accepting the first reading can put someone kilometres
 * away from where they actually are.
 */
export function requestBrowserLocation(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("This device can't share a location."));
      return;
    }

    let best: GeolocationPosition | null = null;
    let settled = false;
    let watchId: number | null = null;

    const finish = (error?: GeolocationPositionError) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);

      if (best && best.coords.accuracy <= 1_000) {
        resolve({
          lat: best.coords.latitude,
          lng: best.coords.longitude,
          accuracy: best.coords.accuracy,
        });
        return;
      }

      if (error?.code === GeolocationPositionError.PERMISSION_DENIED) {
        reject(new Error("Location permission was declined — allow it in your browser or device settings."));
        return;
      }
      if (best) {
        reject(
          new Error(
            "Your device only provided an approximate location. Turn on Precise location for Ashnight in your phone settings, then try again outdoors or near a window.",
          ),
        );
        return;
      }
      reject(new Error("We couldn't read your location. Try again outdoors or near a window."));
    };

    const timeoutId = window.setTimeout(() => finish(), 15_000);
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!best || position.coords.accuracy < best.coords.accuracy) best = position;
        // A fix within 50 metres is precise enough for neighbourhood naming.
        if (position.coords.accuracy <= 50) finish();
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) finish(error);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}
