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

/** Wraps the browser geolocation API in a promise with a readable error. */
export function requestBrowserLocation(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("This device can't share a location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) =>
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? "Location permission was declined — allow it in your browser or device settings."
              : "We couldn't read your location. Try again in a moment.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}
