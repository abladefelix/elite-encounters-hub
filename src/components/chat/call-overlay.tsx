import { useEffect, useState } from "react";
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
 * Call surface for the chat thread. This is the presentation layer only —
 * media tracks get wired in when the realtime backend lands.
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

  useEffect(() => {
    const connectTimer = setTimeout(() => setConnected(true), 1400);
    return () => clearTimeout(connectTimer);
  }, []);

  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, [connected]);

  return (
    <Dialog open onOpenChange={(open) => !open && onEnd()}>
      <DialogContent className="max-w-md overflow-hidden border-border/70 bg-panel p-0">

        <DialogTitle className="sr-only">
          {mode === "video" ? "Video call" : "Voice call"} with {specialist.name}
        </DialogTitle>

        <div className="relative aspect-[4/5] w-full bg-hero">
          {mode === "video" && cameraOn ? (
            <div className="absolute bottom-4 right-4 grid h-28 w-20 place-items-center rounded-lg border border-border bg-surface-strong text-[10px] text-muted-foreground">
              You
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
            {mode === "video" && !cameraOn ? (
              <p className="text-xs text-muted-foreground">Your camera is off</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 border-t border-border/70 bg-surface p-5">
          <CallButton
            active={!muted}
            onClick={() => setMuted((value) => !value)}
            label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </CallButton>

          {mode === "video" ? (
            <CallButton
              active={cameraOn}
              onClick={() => setCameraOn((value) => !value)}
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
