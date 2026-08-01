/**
 * Server identity lookup for the control room.
 *
 * Admins hosting Ashnight themselves need the outbound public IP of the box the
 * app runs on so they can point DNS at it. We resolve it server-side (the
 * browser would only ever see the visitor's own IP) using a couple of plain
 * echo services, and also report the hostname the request arrived on.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestHost } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ServerIdentity {
  /** Public IPv4 of the host running the app, when it could be resolved. */
  ipv4: string | null;
  /** Public IPv6, when the host has one. */
  ipv6: string | null;
  /** Hostname the current request arrived on. */
  host: string | null;
  /** Whichever echo service answered. */
  source: string | null;
  /** Populated when every lookup failed. */
  error: string | null;
  checkedAt: string;
}

const IPV4_SOURCES = [
  { name: "ipify", url: "https://api.ipify.org?format=text" },
  { name: "icanhazip", url: "https://ipv4.icanhazip.com" },
  { name: "cloudflare", url: "https://1.1.1.1/cdn-cgi/trace" },
];

const IP_PATTERN = /\b\d{1,3}(?:\.\d{1,3}){3}\b/;

async function readIp(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) return null;
    const body = (await response.text()).trim();
    // Cloudflare's trace endpoint returns key=value lines.
    const traced = body.match(/^ip=(.+)$/m)?.[1]?.trim();
    const candidate = traced ?? body;
    return IP_PATTERN.test(candidate) ? (candidate.match(IP_PATTERN)?.[0] ?? null) : null;
  } catch {
    return null;
  }
}

export const getServerIdentity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ServerIdentity> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    let ipv4: string | null = null;
    let source: string | null = null;
    for (const candidate of IPV4_SOURCES) {
      const found = await readIp(candidate.url);
      if (found) {
        ipv4 = found;
        source = candidate.name;
        break;
      }
    }

    let ipv6: string | null = null;
    try {
      const response = await fetch("https://api64.ipify.org?format=text", {
        signal: AbortSignal.timeout(6000),
      });
      if (response.ok) {
        const body = (await response.text()).trim();
        if (body.includes(":")) ipv6 = body;
      }
    } catch {
      ipv6 = null;
    }

    return {
      ipv4,
      ipv6,
      host: getRequestHost() ?? getRequestHeader("host") ?? null,
      source,
      error: ipv4 ? null : "No echo service could be reached from this host.",
      checkedAt: new Date().toISOString(),
    };
  });
