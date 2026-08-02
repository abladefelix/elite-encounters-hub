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
  | { kind: "decline"; fromId: string; fromName: string }
  | { kind: "cancel"; fromId: string; fromName: string };

export function ringChannelName(userId: string) {
  return `call-ring:${userId}`;
}

/**
 * Sends one ring event to another member. A short-lived channel is used so the
 * sender never has to stay subscribed to somebody else's ring line.
 */
export async function sendRing(toUserId: string, payload: RingPayload) {
  const channel = supabase.channel(`${ringChannelName(toUserId)}:out:${Date.now()}`, {
    config: { broadcast: { self: false } },
  });

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 4000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      }
    });
  });

  // The receiving side listens on the plain per-member name; broadcast is
  // routed by channel topic, so send on that topic explicitly.
  await supabase
    .channel(ringChannelName(toUserId))
    .send({ type: "broadcast", event: "ring", payload })
    .catch(() => undefined);

  await channel.send({ type: "broadcast", event: "ring", payload }).catch(() => undefined);
  setTimeout(() => void supabase.removeChannel(channel), 1500);
}
