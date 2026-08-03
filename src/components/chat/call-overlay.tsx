import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import { getCallToken } from "@/lib/livekit.functions";

const LiveKitCall = lazy(() => import("@/components/chat/livekit-call"));

import {
  Mic,
  MicOff,
  PhoneOff,
  Video as VideoIcon,
  VideoOff,
  Volume2,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/types";
import { useCopy } from "@/lib/locale";
import { isNativeApp, nativePlatform } from "@/lib/native";

export type CallMode = "audio" | "video";

type SignalPayload =
  | { kind: "ready"; from: string }
  | { kind: "offer"; sdp: RTCSessionDescriptionInit; from: string }
  | { kind: "answer"; sdp: RTCSessionDescriptionInit; from: string }
  | { kind: "ice"; candidate: RTCIceCandidateInit; from: string }
  | { kind: "hangup"; from: string };

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

/**
 * Call surface for the chat thread.
 *
 * Local capture (mic/camera) is real. Signalling (offer/answer/ICE) runs over
 * a Supabase realtime broadcast channel scoped to the thread, so two real
 * participants who both open this overlay on the same thread establish an
 * actual WebRTC peer connection and exchange live media, no simulation.
 */
export interface CallProps {
  threadId: string;
  selfId: string;
  /** Whoever clicked "start call" makes the offer; the other side answers. */
  isCaller: boolean;
  peerName: string;
  mode: CallMode;
  onEnd: () => void;
}

/**
 * Picks the call engine.
 *
 * When an admin has saved LiveKit credentials in the control room vault, calls
 * run through LiveKit's relay infrastructure — far more reliable on mobile data
 * and behind firewalls. Without credentials, Ashnight falls back to the built-in
 * direct peer-to-peer call so calling never simply stops working.
 */
export function CallOverlay(props: CallProps) {
  const fetchToken = useServerFn(getCallToken);
  const { data, isPending, isError } = useQuery({
    queryKey: ["call-token", props.threadId, props.mode],
    queryFn: () => fetchToken({ data: { threadId: props.threadId, mode: props.mode } }),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });

  if (isPending) {
    return (
      <Dialog open onOpenChange={(open) => !open && props.onEnd()}>
        <DialogContent className="max-w-sm border-border/70 bg-panel">
          <DialogTitle className="sr-only">Starting call</DialogTitle>
          <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Setting up the call…
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!isError && data?.configured) {
    return (
      <Suspense fallback={null}>
        <LiveKitCall
          url={data.url}
          token={data.token}
          peerName={props.peerName}
          mode={props.mode}
          onEnd={props.onEnd}
        />
      </Suspense>
    );
  }

  return <PeerCall {...props} />;
}

function PeerCall({

  threadId,
  selfId,
  isCaller,
  peerName,
  mode,
  onEnd,
}: {
  threadId: string;
  selfId: string;
  /** Whoever clicked "start call" makes the offer; the other side answers. */
  isCaller: boolean;
  peerName: string;
  mode: CallMode;
  onEnd: () => void;
}) {
  const { t } = useCopy();
  const [seconds, setSeconds] = useState(0);

  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(mode === "video");
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [status, setStatus] = useState("Connecting…");
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const endedRef = useRef(false);

  const cleanup = useCallback(() => {
    endedRef.current = true;
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const hangUp = useCallback(() => {
    void channelRef.current?.send({
      type: "broadcast",
      event: "signal",
      payload: { kind: "hangup", from: selfId } satisfies SignalPayload,
    });
    cleanup();
    onEnd();
  }, [cleanup, onEnd, selfId]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: mode === "video" ? { facingMode: "user" } : false,
        });
      } catch {
        if (!cancelled) {
          const native = isNativeApp();
          const where = native
            ? nativePlatform() === "ios"
              ? "Open iPhone Settings → Ashnight and turn on Microphone (and Camera for video), then try the call again."
              : "Open Settings → Apps → Ashnight → Permissions and allow Microphone (and Camera for video), then try again."
            : "Check your browser permissions for this site.";
          setMediaError(
            mode === "video"
              ? `Camera and mic blocked. ${where}`
              : `Microphone blocked. ${where}`,
          );
        }
      }
      if (cancelled) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      if (stream && videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => undefined);
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      stream?.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (!remoteStream) return;
        if (mode === "video" && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          void remoteVideoRef.current.play().catch(() => undefined);
        }
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          void remoteAudioRef.current.play().catch(() => undefined);
        }
      };

      pc.onconnectionstatechange = () => {
        if (cancelled) return;
        if (pc.connectionState === "connected") {
          setConnected(true);
          setStatus("Connected");
        } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          setStatus("Connection lost");
        }
      };

      const channel = supabase.channel(`call:${threadId}`, {
        config: { broadcast: { self: false } },
      });
      channelRef.current = channel;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          void channel.send({
            type: "broadcast",
            event: "signal",
            payload: { kind: "ice", candidate: event.candidate.toJSON(), from: selfId } satisfies SignalPayload,
          });
        }
      };

      // Candidates that arrive before the remote description is set have to be
      // held back, otherwise the browser rejects them and the call never joins.
      const pendingIce: RTCIceCandidateInit[] = [];
      const flushIce = async (conn: RTCPeerConnection) => {
        while (pendingIce.length) {
          const candidate = pendingIce.shift();
          if (!candidate) break;
          await conn.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
        }
      };

      /** Builds and broadcasts a fresh offer — used whenever the callee joins. */
      const sendOffer = async () => {
        const conn = pcRef.current;
        if (!conn || cancelled) return;
        const offer = await conn.createOffer();
        await conn.setLocalDescription(offer);
        void channel.send({
          type: "broadcast",
          event: "signal",
          payload: { kind: "offer", sdp: offer, from: selfId } satisfies SignalPayload,
        });
        setStatus("Ringing…");
      };

      channel
        .on("broadcast", { event: "signal" }, async ({ payload }: { payload: SignalPayload }) => {
          if (cancelled || payload.from === selfId || !pcRef.current) return;
          const conn = pcRef.current;
          try {
            if (payload.kind === "ready") {
              // The other side just joined. Only the caller offers, and it
              // re-offers here because the first offer may have been sent
              // before anyone was listening.
              if (isCaller) await sendOffer();
            } else if (payload.kind === "offer" && !isCaller) {
              await conn.setRemoteDescription(new RTCSessionDescription(payload.sdp));
              await flushIce(conn);
              const answer = await conn.createAnswer();
              await conn.setLocalDescription(answer);
              void channel.send({
                type: "broadcast",
                event: "signal",
                payload: { kind: "answer", sdp: answer, from: selfId } satisfies SignalPayload,
              });
              setStatus("Connecting…");
            } else if (payload.kind === "answer" && isCaller) {
              if (conn.signalingState === "have-local-offer") {
                await conn.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                await flushIce(conn);
              }
            } else if (payload.kind === "ice") {
              if (conn.remoteDescription) {
                await conn.addIceCandidate(new RTCIceCandidate(payload.candidate));
              } else {
                pendingIce.push(payload.candidate);
              }
            } else if (payload.kind === "hangup") {
              setStatus("The other person left the call");
              cleanup();
              onEnd();
            }
          } catch (error) {
            console.error("call signal failed", error);
          }
        })
        .subscribe((subStatus) => {
          if (subStatus !== "SUBSCRIBED" || cancelled) return;
          // Announce the join in both directions: the caller's offer is only
          // useful once somebody is on the channel to hear it.
          void channel.send({
            type: "broadcast",
            event: "signal",
            payload: { kind: "ready", from: selfId } satisfies SignalPayload,
          });
          if (isCaller) {
            void sendOffer();
          } else {
            setStatus("Connecting…");
          }
        });
    }

    void start();

    return () => {
      cancelled = true;
      if (!endedRef.current) cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, threadId, selfId, isCaller]);

  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, [connected]);

  const toggleMute = useCallback(() => {
    setMuted((value) => {
      const next = !value;
      streamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = !next;
      });
      return next;
    });
  }, []);

  const toggleCamera = useCallback(() => {
    setCameraOn((value) => {
      const next = !value;
      streamRef.current?.getVideoTracks().forEach((track) => {
        track.enabled = next;
      });
      return next;
    });
  }, []);

  const showSelfVideo = mode === "video" && cameraOn && !mediaError;

  return (
    <Dialog open onOpenChange={(open) => !open && hangUp()}>
      <DialogContent className="max-w-md overflow-hidden border-border/70 bg-panel p-0">
        <DialogTitle className="sr-only">
          {mode === "video" ? t("chat.video") : t("chat.voice")} {t("chat.call")} with {peerName}
        </DialogTitle>

        <div className="relative aspect-[4/5] w-full bg-hero">
          {mode === "video" ? (
            <video
              ref={remoteVideoRef}
              playsInline
              autoPlay
              className={cn("absolute inset-0 h-full w-full object-cover", !connected && "hidden")}
            />
          ) : (
            <audio ref={remoteAudioRef} autoPlay />
          )}

          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className={cn(
              "absolute bottom-4 right-4 h-28 w-20 rounded-lg border border-border object-cover",
              showSelfVideo ? "block" : "hidden",
            )}
          />
          {mode === "video" && !showSelfVideo ? (
            <div className="absolute bottom-4 right-4 grid h-28 w-20 place-items-center rounded-lg border border-border bg-surface-strong text-center text-[10px] text-muted-foreground">
              {t("chat.cameraOff")}
            </div>
          ) : null}

          <div
            className={cn(
              "flex h-full flex-col items-center justify-center gap-4 px-6 text-center",
              connected && mode === "video" && "pointer-events-none opacity-0",
            )}
          >
            <Avatar
              className={cn(
                "size-24 border border-border transition-all",
                connected && "ring-4 ring-primary/25",
              )}
            >
              <AvatarFallback className="bg-surface-strong font-display text-2xl font-semibold">
                {initials(peerName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-display text-lg font-semibold">{peerName}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {connected
                  ? `${mode === "video" ? t("chat.video") : t("chat.voice")} ${t("chat.call")} · ${formatDuration(seconds)}`
                  : status}
              </p>
            </div>
            {mediaError ? <p className="max-w-xs text-xs text-warning">{mediaError}</p> : null}
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 border-t border-border/70 bg-surface p-5">
          <CallButton active={!muted} onClick={toggleMute} label={muted ? t("chat.unmute") : t("chat.mute")}>
            {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </CallButton>

          {mode === "video" ? (
            <CallButton
              active={cameraOn}
              onClick={toggleCamera}
              label={cameraOn ? "Turn camera off" : "Turn camera on"}
            >
              {cameraOn ? <VideoIcon className="size-4" /> : <VideoOff className="size-4" />}
            </CallButton>
          ) : (
            <CallButton active label={t("chat.speaker")}>
              <Volume2 className="size-4" />
            </CallButton>
          )}

          <Button
            size="icon"
            variant="destructive"
            className="size-12 rounded-full"
            onClick={hangUp}
            aria-label={t("chat.endCall")}
          >
            <PhoneOff className="size-5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CallButton({
  children,
  active,
  onClick,
  label,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick?: () => void;
  label: string;
}) {
  return (
    <Button
      size="icon"
      variant={active ? "soft" : "secondary"}
      className="size-12 rounded-full"
      onClick={onClick}
      aria-label={label}
    >
      {children}
    </Button>
  );
}
