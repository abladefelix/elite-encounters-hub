import { useCallback, useEffect, useRef, useState } from "react";
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
import { cn } from "@/lib/utils";
import { initials, type Specialist } from "@/lib/types";

export type CallMode = "audio" | "video";

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

/**
 * Call surface for the chat thread.
 *
 * The local side is real: we capture mic (and camera for video calls) with
 * getUserMedia, and the mute / camera controls toggle the actual tracks. The
 * remote side is simulated until the realtime peer connection lands.
 */
export function CallOverlay({
  specialist,
  mode,
  onEnd,
}: {
  specialist: Specialist;
  mode: CallMode;
  onEnd: () => void;
}) {
  const [seconds, setSeconds] = useState(0);
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(mode === "video");
  const [mediaError, setMediaError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Acquire local media once, and always release it when the call ends.
  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: mode === "video" ? { facingMode: "user" } : false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      } catch {
        if (!cancelled) {
          setMediaError(
            mode === "video"
              ? "Camera and mic blocked — the call continues without your video."
              : "Microphone blocked — check your browser permissions.",
          );
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [mode]);

  useEffect(() => {
    const connectTimer = setTimeout(() => setConnected(true), 1400);
    return () => clearTimeout(connectTimer);
  }, []);

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
    <Dialog open onOpenChange={(open) => !open && onEnd()}>
      <DialogContent className="max-w-md overflow-hidden border-border/70 bg-panel p-0">
        <DialogTitle className="sr-only">
          {mode === "video" ? "Video call" : "Voice call"} with {specialist.name}
        </DialogTitle>

        <div className="relative aspect-[4/5] w-full bg-hero">
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
              Camera off
            </div>
          ) : null}

          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <Avatar
              className={cn(
                "size-24 border border-border transition-all",
                connected && "ring-4 ring-primary/25",
              )}
            >
              <AvatarFallback className="bg-surface-strong font-display text-2xl font-semibold">
                {initials(specialist.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-display text-lg font-semibold">{specialist.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {connected
                  ? `${mode === "video" ? "Video" : "Voice"} call · ${formatDuration(seconds)}`
                  : "Connecting…"}
              </p>
            </div>
            {mediaError ? (
              <p className="max-w-xs text-xs text-warning">{mediaError}</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 border-t border-border/70 bg-surface p-5">
          <CallButton
            active={!muted}
            onClick={toggleMute}
            label={muted ? "Unmute" : "Mute"}
          >
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
            <CallButton active label="Speaker">
              <Volume2 className="size-4" />
            </CallButton>
          )}

          <Button
            size="icon"
            variant="destructive"
            className="size-12 rounded-full"
            onClick={onEnd}
            aria-label="End call"
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
