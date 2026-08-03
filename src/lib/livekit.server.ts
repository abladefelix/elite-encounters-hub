/**
 * LiveKit call credentials and token minting.
 *
 * Credentials live in the admin key vault (`integration_keys`), so they can be
 * rotated from the control room without a deploy. The API secret never leaves
 * the server: the browser only ever receives a short-lived join token scoped to
 * one call room.
 *
 * The token is a plain HS256 JWT signed with Web Crypto, so it works in the
 * edge runtime with no Node-only SDK.
 */

export interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Reads the three LiveKit values from the vault. Empty strings when unset. */
export async function readLiveKitConfig(): Promise<LiveKitConfig> {
  try {
    const client = await admin();
    const { data } = await client
      .from("integration_keys")
      .select("key, value")
      .in("key", ["livekit_url", "livekit_api_key", "livekit_api_secret"]);
    const map = new Map((data ?? []).map((row) => [row.key, (row.value ?? "").trim()]));
    return {
      url: map.get("livekit_url") ?? "",
      apiKey: map.get("livekit_api_key") ?? "",
      apiSecret: map.get("livekit_api_secret") ?? "",
    };
  } catch {
    return { url: "", apiKey: "", apiSecret: "" };
  }
}

export function isLiveKitConfigured(config: LiveKitConfig) {
  return Boolean(config.url && config.apiKey && config.apiSecret);
}

function base64url(input: Uint8Array | string) {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Mints a join token for one room. `ttlSeconds` keeps the grant short so a
 * leaked token cannot be replayed hours later.
 */
export async function mintLiveKitToken(options: {
  config: LiveKitConfig;
  room: string;
  identity: string;
  name: string;
  canPublishVideo: boolean;
  ttlSeconds?: number;
}): Promise<string> {
  const { config, room, identity, name, canPublishVideo } = options;
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: config.apiKey,
    sub: identity,
    jti: `${identity}-${now}`,
    nbf: now - 10,
    exp: now + (options.ttlSeconds ?? 60 * 60),
    name,
    video: {
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canPublishSources: canPublishVideo
        ? ["microphone", "camera"]
        : ["microphone"],
    },
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(config.apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}
