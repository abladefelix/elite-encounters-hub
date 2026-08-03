/**
 * Small poster tile for a portfolio clip.
 *
 * A wide inline player dominates both the profile editor and the public
 * profile, so the clip shows as a compact thumbnail (first frame, grabbed on
 * the client) and only opens full size in a dialog when tapped.
 */
import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function VideoThumbnail({
  url,
  label = "Intro video",
  className,
}: {
  url: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [poster, setPoster] = useState<string | null>(null);
  const frameRef = useRef<HTMLVideoElement | null>(null);

  // Draw the first frame once metadata is in, so the tile isn't a black box.
  useEffect(() => {
    setPoster(null);
    const video = frameRef.current;
    if (!video) return;
    const grab = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        setPoster(canvas.toDataURL("image/jpeg", 0.7));
      } catch {
        // Cross-origin frames can't be read — the play badge alone is fine.
      }
    };
    video.addEventListener("seeked", grab, { once: true });
    const seek = () => {
      try {
        video.currentTime = 0.1;
      } catch {
        grab();
      }
    };
    video.addEventListener("loadeddata", seek, { once: true });
    return () => {
      video.removeEventListener("seeked", grab);
      video.removeEventListener("loadeddata", seek);
    };
  }, [url]);

  return (
    <>
      <video ref={frameRef} src={url} preload="metadata" muted playsInline className="hidden" />

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Play ${label}`}
        className={cn(
          "group relative aspect-video w-40 overflow-hidden rounded-lg border border-border/60 bg-panel",
          className,
        )}
      >
        {poster ? (
          <img src={poster} alt={label} className="size-full object-cover" />
        ) : null}
        <span className="absolute inset-0 grid place-items-center bg-background/35 transition-colors group-hover:bg-background/20">
          <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-elevated">
            <Play className="size-4" />
          </span>
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl p-3">
          <DialogTitle className="sr-only">{label}</DialogTitle>
          {open ? (
            <video
              src={url}
              controls
              autoPlay
              playsInline
              className="w-full rounded-lg border border-border/60"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
