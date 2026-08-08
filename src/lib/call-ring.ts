/**
 * Call ringing.
 *
 * WebRTC signalling for an in-progress call lives on `call:<threadId>`, but a
 * call can only connect if the other member actually joins that channel. This
 * module carries the invitation itself over a per-member channel
 * (`call-ring:<userId>`), which the app subscribes to for the whole session, so
 * a real ring reaches the other side wherever they are in Ashnight.
 */
import { supabase } from "@/integrations/supabase/client";

export type RingMode = "audio" | "video";

export type RingPayload =
  | {
      kind: "invite";
      threadId: string;
      mode: RingMode;
      fromId: string;
      fromName: string;
    }
  | { kind: "decline"; fromId: string; fromName: string; reason?: "unavailable" | "declined" }
  | { kind: "cancel"; fromId: string; fromName: string };

export function ringChannelName(userId: string) {
  return `call-ring:${userId}`;
}

/**
 * Sends one ring event to another member by joining their ring topic just long
 * enough to broadcast, then leaving it again.
 */
export async function sendRing(toUserId: string, payload: RingPayload) {
  const channel = supabase.channel(ringChannelName(toUserId), {
    config: { broadcast: { self: false } },
  });

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 4000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timer);
        resolve();
      }
    });
  });

  await channel.send({ type: "broadcast", event: "ring", payload }).catch(() => undefined);
  setTimeout(() => void supabase.removeChannel(channel), 1500);
}
