/**
 * Reverse geocoding — turns raw coordinates into a readable place name.
 *
 * Uses the Google Geocoding API when an admin has saved a Google Maps key in
 * the Control room key vault, and falls back to OpenStreetMap's free Nominatim
 * service so a fresh install still names locations out of the box.
 */

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function googleKey(): Promise<string> {
  try {
    const client = await admin();
    const { data } = await client
      .from("integration_keys")
      .select("value")
      .eq("key", "google_maps_api_key")
      .maybeSingle();
    return (data?.value ?? "").trim();
  } catch {
    return "";
  }
}

/** Keeps the label short: neighbourhood / town, region — no street numbers. */
function tidy(parts: (string | undefined | null)[]): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const part of parts) {
    const value = (part ?? "").trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    kept.push(value);
    if (kept.length === 3) break;
  }
  return kept.join(", ");
}

async function viaGoogle(lat: number, lng: number, key: string): Promise<string> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("key", key);
  // No result_type filter: the most precise match first gives street-level detail.

  const response = await fetch(url.toString());
  if (!response.ok) return "";
  const body = (await response.json()) as {
    status?: string;
    results?: { address_components?: { long_name: string; types: string[] }[] }[];
  };
  if (body.status !== "OK" || !body.results?.length) return "";

  // Only the first (most precise) result — mixing components across results can
  // stitch together pieces of places that are nowhere near each other.
  const components = body.results[0]?.address_components ?? [];
  const pick = (type: string) =>
    components.find((component) => component.types.includes(type))?.long_name;

  return tidy([
    pick("route") ?? pick("sublocality_level_2"),
    pick("neighborhood") ?? pick("sublocality_level_1") ?? pick("sublocality"),
    pick("locality") ?? pick("postal_town") ?? pick("administrative_area_level_2"),
  ]);
}

async function viaNominatim(lat: number, lng: number): Promise<string> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url.toString(), {
    headers: { "User-Agent": "Ashnight/1.0 (location naming)", Accept: "application/json" },
  });
  if (!response.ok) return "";
  const body = (await response.json()) as {
    address?: Record<string, string>;
    display_name?: string;
  };
  const address = body.address ?? {};
  const label = tidy([
    address["road"] ?? address["residential"],
    address["neighbourhood"] ??
      address["quarter"] ??
      address["hamlet"] ??
      address["suburb"] ??
      address["village"],
    address["city"] ?? address["town"] ?? address["municipality"] ?? address["county"],
  ]);
  return label || (body.display_name ?? "").split(",").slice(0, 3).join(",").trim();
}

/** Best-effort place name for a coordinate pair; "" when nothing is available. */
export async function describeCoordinates(lat: number, lng: number): Promise<string> {
  const key = await googleKey();
  try {
    if (key) {
      const google = await viaGoogle(lat, lng, key);
      if (google) return google;
    }
    return await viaNominatim(lat, lng);
  } catch {
    return "";
  }
}
