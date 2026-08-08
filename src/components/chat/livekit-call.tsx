/**
 * LiveKit-powered call surface.
 *
 * Browser-only: this module imports `livekit-client`, so it is loaded lazily and
 * never evaluated during SSR. Media is relayed through LiveKit's SFU/TURN
 * infrastructure, which is what makes calls connect on mobile data and behind
 * strict firewalls where plain peer-to-peer fails.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  PhoneOff,
  Video as VideoIcon,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  ConnectionState,
  RemoteTrack,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/types";
import { useCopy } from "@/lib/locale";
import { useSpeaker } from "@/lib/call-speaker";
import { isNativeApp, nativePlatform } from "@/lib/native";

export type CallMode = "audio" | "video";

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function permissionHint(mode: CallMode) {
  const where = isNativeApp()
    ? nativePlatform() === "ios"
      ? "Open iPhone Settings → Ashnight and turn on Microphone (and Camera for video), then try the call again."
      : "Open Settings → Apps → Ashnight → Permissions and allow Microphone (and Camera for video), then try again."
    : "Check your browser permissions for this site.";
  return mode === "video"
    ? `Camera and mic blocked. ${where}`
    : `Microphone blocked. ${where}`;
}

export function LiveKitCall({
  url,
  token,
  peerName,
  mode,
  onEnd,
  onPeerJoined,
}: {
  url: string;
  token: string;
  peerName: string;
  mode: CallMode;
  onEnd: () => void;
  /** Fires the first time someone else actually joins the call. */
  onPeerJoined?: (() => void) | undefined;
}) {
  const { t } = useCopy();
  const [seconds, setSeconds] = useState(0);
  const [connected, setConnected] = useState(false);
  const [peerJoined, setPeerJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(mode === "video");
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [status, setStatus] = useState("Connecting…");
  const roomRef = useRef<Room | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);



  const hangUp = useCallback(() => {
    void roomRef.current?.disconnect();
    roomRef.current = null;
    onEnd();
  }, [onEnd]);

  useEffect(() => {
    let cancelled = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    const attach = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
        track.attach(remoteVideoRef.current);
      } else if (track.kind === Track.Kind.Audio && remoteAudioRef.current) {
        track.attach(remoteAudioRef.current);
      }
    };

    room
      .on(RoomEvent.TrackSubscribed, (track) => {
        setPeerJoined(true);
        attach(track);
      })
      .on(RoomEvent.ParticipantConnected, () => {
        setPeerJoined(true);
        setStatus("Connected");
      })
      .on(RoomEvent.ParticipantDisconnected, () => {
        setStatus("The other person left the call");
        setPeerJoined(false);
        window.setTimeout(() => {
          if (!cancelled) hangUp();
        }, 1200);
      })
      .on(RoomEvent.ConnectionStateChanged, (state) => {
        if (cancelled) return;
        if (state === ConnectionState.Connected) {
          setConnected(true);
          setStatus(room.remoteParticipants.size ? "Connected" : "Ringing…");
        } else if (state === ConnectionState.Reconnecting) {
          setStatus("Reconnecting…");
        } else if (state === ConnectionState.Disconnected) {
          setStatus("Call ended");
        }
      })
      .on(RoomEvent.Disconnected, () => {
        if (!cancelled) onEnd();
      });

    void (async () => {
      try {
        await room.connect(url, token);
        if (cancelled) return;
        setPeerJoined(room.remoteParticipants.size > 0);
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          if (mode === "video") await room.localParticipant.setCameraEnabled(true);
        } catch {
          if (!cancelled) setMediaError(permissionHint(mode));
        }
        const localVideo = room.localParticipant
          .getTrackPublications()
          .find((pub) => pub.kind === Track.Kind.Video)?.track;
        if (localVideo && localVideoRef.current) localVideo.attach(localVideoRef.current);

        // Pick up anyone already publishing before we joined.
        room.remoteParticipants.forEach((participant) => {
          participant.trackPublications.forEach((pub) => {
            if (pub.track) attach(pub.track as RemoteTrack);
          });
        });
      } catch (error) {
        console.error("livekit connect failed", error);
        if (!cancelled) setStatus("Could not connect the call. Please try again.");
      }
    })();

    return () => {
      cancelled = true;
      void room.disconnect();
      roomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, token, mode]);

  useEffect(() => {
    if (!connected || !peerJoined) return;
    const interval = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, [connected, peerJoined]);

  const toggleMute = useCallback(() => {
    setMuted((value) => {
      const next = !value;
      void roomRef.current?.localParticipant.setMicrophoneEnabled(!next);
      return next;
    });
  }, []);

  const toggleCamera = useCallback(() => {
    setCameraOn((value) => {
      const next = !value;
      void (async () => {
        await roomRef.current?.localParticipant.setCameraEnabled(next);
        const track = roomRef.current?.localParticipant
          .getTrackPublications()
          .find((pub) => pub.kind === Track.Kind.Video)?.track;
        if (next && track && localVideoRef.current) track.attach(localVideoRef.current);
      })();
      return next;
    });
  }, []);

  const live = connected && peerJoined;
  const {
    speakerOn,
    supported: speakerSupported,
    toggleSpeaker,
  } = useSpeaker(remoteAudioRef, live);

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
              className={cn("absolute inset-0 h-full w-full object-cover", !live && "hidden")}
            />
          ) : null}
          <audio ref={remoteAudioRef} autoPlay />

          <video
            ref={localVideoRef}
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
              live && mode === "video" && "pointer-events-none opacity-0",
            )}
          >
            <Avatar
              className={cn(
                "size-24 border border-border transition-all",
                live && "ring-4 ring-primary/25",
              )}
            >
              <AvatarFallback className="bg-surface-strong font-display text-2xl font-semibold">
                {initials(peerName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-display text-lg font-semibold">{peerName}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {live
                  ? `${mode === "video" ? t("chat.video") : t("chat.voice")} ${t("chat.call")} · ${formatDuration(seconds)}`
                  : status}
              </p>
            </div>
            {mediaError ? <p className="max-w-xs text-xs text-warning">{mediaError}</p> : null}
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 border-t border-border/70 bg-surface p-5">
          <CallButton
            active={!muted}
            onClick={toggleMute}
            label={muted ? t("chat.unmute") : t("chat.mute")}
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
            <CallButton
              active={speakerOn}
              onClick={toggleSpeaker}
              disabled={!speakerSupported}
              label={
                speakerSupported
                  ? speakerOn
                    ? "Switch to earpiece"
                    : t("chat.speaker")
                  : "Speaker is controlled by your device"
              }
            >
              {speakerOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
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
  disabled,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick?: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Button
      size="icon"
      variant={active ? "soft" : "secondary"}
      className="size-12 rounded-full"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
  );
}

export default LiveKitCall;
