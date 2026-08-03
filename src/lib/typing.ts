/**
 * Typing indicator.
 *
 * A thread-scoped Realtime broadcast channel (`typing:<threadId>`) carries a
 * lightweight "still typing" ping. Nothing is written to the database: the ping
 * expires on its own after a couple of seconds, so a member who closes the app
 * mid-sentence stops showing as typing without any cleanup message.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

/** How long a single ping keeps the indicator alive. */
const PING_TTL_MS = 3500;
/** Minimum gap between outgoing pings while someone types continuously. */
const PING_THROTTLE_MS = 1500;

export function useTypingIndicator(threadId: string | undefined, userId: string | undefined) {
  const [peerTyping, setPeerTyping] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastSent = useRef(0);
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPeerTyping(false);
    if (expiry.current) clearTimeout(expiry.current);
    if (!threadId || !userId) {
      channelRef.current = null;
      return;
    }

    const channel = supabase.channel(`typing:${threadId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const from = (payload as { from?: string } | null)?.from;
        if (!from || from === userId) return;
        setPeerTyping(true);
        if (expiry.current) clearTimeout(expiry.current);
        expiry.current = setTimeout(() => setPeerTyping(false), PING_TTL_MS);
      })
      .on("broadcast", { event: "stopped" }, ({ payload }) => {
        const from = (payload as { from?: string } | null)?.from;
        if (!from || from === userId) return;
        if (expiry.current) clearTimeout(expiry.current);
        setPeerTyping(false);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (expiry.current) clearTimeout(expiry.current);
      channelRef.current = null;
      lastSent.current = 0;
      void supabase.removeChannel(channel);
    };
  }, [threadId, userId]);

  /** Call on every keystroke — throttled internally. */
  const notifyTyping = useCallback(() => {
    const channel = channelRef.current;
    if (!channel || !userId) return;
    const now = Date.now();
    if (now - lastSent.current < PING_THROTTLE_MS) return;
    lastSent.current = now;
    void channel.send({ type: "broadcast", event: "typing", payload: { from: userId } });
  }, [userId]);

  /** Call when the draft is sent or cleared, so the dots disappear at once. */
  const notifyStopped = useCallback(() => {
    const channel = channelRef.current;
    if (!channel || !userId) return;
    lastSent.current = 0;
    void channel.send({ type: "broadcast", event: "stopped", payload: { from: userId } });
  }, [userId]);

  return { peerTyping, notifyTyping, notifyStopped };
}
