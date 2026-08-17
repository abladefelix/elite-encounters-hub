/**
 * Call join tokens.
 *
 * A member asks for a token for one chat thread; the server checks — as that
 * member, under RLS — that they really are a participant of the thread before
 * signing anything. If an admin has not filled the LiveKit vault fields yet the
 * function reports `configured: false` and the app falls back to direct
 * peer-to-peer calling.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireActiveSession } from "@/lib/active-session-middleware";

const inputSchema = z.object({
  threadId: z.string().uuid(),
  mode: z.enum(["audio", "video"]),
});

export interface CallTokenResult {
  configured: boolean;
  url: string;
  token: string;
  room: string;
}

export const getCallToken = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<CallTokenResult> => {
    const { supabase, userId } = context;

    const { data: thread, error } = await supabase
      .from("threads")
      .select("id, client_id, specialist_id")
      .eq("id", data.threadId)
      .maybeSingle();

    if (error) throw new Error("Could not verify this conversation.");
    if (!thread || (thread.client_id !== userId && thread.specialist_id !== userId)) {
      throw new Error("You are not part of this conversation.");
    }

    // Admins can force the direct peer-to-peer engine platform-wide; honour
    // that here so the choice can't be bypassed from a member's browser.
    const { data: callSettings } = await supabase.rpc("settings_section", {
      _section: "calls",
    });
    const engine = (callSettings as { engine?: string } | null)?.engine ?? "auto";
    if (engine === "webrtc") {
      return { configured: false, url: "", token: "", room: "" };
    }

    const { readLiveKitConfig, isLiveKitConfigured, mintLiveKitToken } = await import(
      "@/lib/livekit.server"
    );
    const config = await readLiveKitConfig();
    if (!isLiveKitConfigured(config)) {
      return { configured: false, url: "", token: "", room: "" };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", userId)
      .maybeSingle();

    const room = `thread-${data.threadId}`;
    const token = await mintLiveKitToken({
      config,
      room,
      identity: userId,
      name: profile?.display_name || profile?.username || "Ashnight member",
      canPublishVideo: data.mode === "video",
      ttlSeconds: 60 * 60,
    });

    return { configured: true, url: config.url, token, room };
  });
