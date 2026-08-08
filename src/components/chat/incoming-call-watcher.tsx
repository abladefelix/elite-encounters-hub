/**
 * Incoming call ring.
 *
 * Every signed-in member listens on their own ring channel for the whole
 * session, so a voice or video call actually reaches them — previously both
 * sides had to open the same thread at the same time for a call to connect.
 */
import { useCallback, useEffect, useState } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CallOverlay, type CallMode } from "@/components/chat/call-overlay";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { ringChannelName, sendRing, type RingPayload } from "@/lib/call-ring";
import { readCallPreferences } from "@/lib/call-preferences";

type Invite = { threadId: string; mode: CallMode; fromId: string; fromName: string };

export function IncomingCallWatcher() {
  const { user, profile } = useAuth();
  const userId = user?.id;
  // The member's own call settings from /profile decide whether we ring at all.
  const prefs = readCallPreferences(profile?.extra);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [active, setActive] = useState<Invite | null>(null);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(ringChannelName(userId), { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "ring" }, ({ payload }: { payload: RingPayload }) => {
        if (payload.kind === "invite") {
          if (!prefs.acceptCalls) {
            // Calls turned off: decline quietly instead of ringing.
            void sendRing(payload.fromId, {
              kind: "decline",
              fromId: userId,
              fromName: "The other member",
            });
            return;
          }
          if (prefs.vibrate && typeof navigator !== "undefined" && "vibrate" in navigator) {
            navigator.vibrate?.([400, 200, 400]);
          }
          setInvite({
            threadId: payload.threadId,
            mode: payload.mode,
            fromId: payload.fromId,
            fromName: payload.fromName,
          });
        } else if (payload.kind === "decline") {
          toast(`${payload.fromName} declined the call`);
        } else if (payload.kind === "cancel") {
          setInvite((current) => (current?.fromId === payload.fromId ? null : current));
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, prefs.acceptCalls, prefs.vibrate]);

  // Ringtone: a short repeating chime while the invite dialog is open.
  useEffect(() => {
    if (!invite || active || !prefs.ringtone) return;
    let stopped = false;
    const AudioCtor =
      typeof window === "undefined"
        ? undefined
        : window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    const context = new AudioCtor();
    const chime = () => {
      if (stopped) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.5);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.55);
    };
    chime();
    const timer = setInterval(chime, 1800);
    return () => {
      stopped = true;
      clearInterval(timer);
      void context.close().catch(() => undefined);
    };
  }, [invite, active, prefs.ringtone]);

  // A ring that is never answered stops itself after 45 seconds, so an
  // abandoned call cannot sit there ringing or waiting forever.
  useEffect(() => {
    if (!invite || active) return;
    const timer = window.setTimeout(() => setInvite(null), 45_000);
    return () => window.clearTimeout(timer);
  }, [invite, active]);

  const decline = useCallback(() => {
    if (!invite) return;
    void sendRing(invite.fromId, {
      kind: "decline",
      fromId: userId ?? "",
      fromName: "The other member",
    });
    setInvite(null);
  }, [invite, userId]);

  if (!userId) return null;

  return (
    <>
      <Dialog open={Boolean(invite) && !active} onOpenChange={(open) => !open && decline()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {invite?.mode === "video" ? (
                <Video className="size-4 text-primary" />
              ) : (
                <Phone className="size-4 text-primary" />
              )}
              Incoming {invite?.mode === "video" ? "video" : "voice"} call
            </DialogTitle>
            <DialogDescription>
              {invite?.fromName ?? "An Ashnight member"} is calling you.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="destructive" onClick={decline}>
              <PhoneOff className="size-4" /> Decline
            </Button>
            <Button
              variant="brass"
              onClick={() => {
                setActive(invite);
                setInvite(null);
              }}
            >
              <Phone className="size-4" /> Answer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {active ? (
        <CallOverlay
          threadId={active.threadId}
          selfId={userId}
          isCaller={false}
          peerName={active.fromName}
          mode={active.mode}
          onEnd={() => setActive(null)}
        />
      ) : null}
    </>
  );
}
