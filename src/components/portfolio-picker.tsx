/**
 * Specialist portfolio picker used during sign-up.
 *
 * Collects several work photos plus one short intro video. Files are held in
 * component state and only uploaded once the new account has a session, since
 * Ashnight storage is private.
 */
import { Film, ImagePlus, X } from "lucide-react";
import { useEffect, useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { validateMediaFile } from "@/lib/media-validation";

export const MAX_PORTFOLIO_PHOTOS = 6;
export const MAX_PHOTO_MB = 8;
export const MAX_VIDEO_MB = 60;
export const MAX_VIDEO_SECONDS = 180;

interface Props {
  photos: File[];
  video: File | null;
  onPhotosChange: (files: File[]) => void;
  onVideoChange: (file: File | null) => void;
  onReject: (message: string) => void;
}

export function PortfolioPicker({
  photos,
  video,
  onPhotosChange,
  onVideoChange,
  onReject,
}: Props) {
  const previews = useMemo(() => photos.map((file) => URL.createObjectURL(file)), [photos]);
  const videoPreview = useMemo(() => (video ? URL.createObjectURL(video) : null), [video]);

  useEffect(
    () => () => {
      for (const url of previews) URL.revokeObjectURL(url);
      if (videoPreview) URL.revokeObjectURL(videoPreview);
    },
    [previews, videoPreview],
  );

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const incoming = Array.from(files);
    const room = MAX_PORTFOLIO_PHOTOS - photos.length;
    if (room <= 0) {
      onReject(`You can attach up to ${MAX_PORTFOLIO_PHOTOS} photos.`);
      return;
    }
    for (const file of incoming.slice(0, room)) {
      const problem = await validateMediaFile(file, { kind: "image", maxMB: MAX_PHOTO_MB });
      if (problem) {
        onReject(problem);
        return;
      }
    }
    onPhotosChange([...photos, ...incoming.slice(0, room)]);
  }

  async function setVideo(file: File | undefined) {
    if (!file) return;
    const problem = await validateMediaFile(file, {
      kind: "video",
      maxMB: MAX_VIDEO_MB,
      maxSeconds: MAX_VIDEO_SECONDS,
    });
    if (problem) {
      onReject(problem);
      return;
    }
    onVideoChange(file);
  }

  return (
    <div className="space-y-4 rounded-lg border border-border/70 bg-secondary/30 p-3">
      <div className="space-y-2">
        <Label>Work photos</Label>
        <p className="text-xs text-muted-foreground">
          Up to {MAX_PORTFOLIO_PHOTOS} photos of finished work, {MAX_PHOTO_MB}MB each. Vetting
          reviews these before you are placed in a room.
        </p>
        {photos.length ? (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((file, index) => (
              <div key={`${file.name}-${index}`} className="relative overflow-hidden rounded-lg">
                <img
                  src={previews[index]}
                  alt={file.name}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => onPhotosChange(photos.filter((_, i) => i !== index))}
                  className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-background/85 text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <input
          id="signup-portfolio-photos"
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void addPhotos(event.target.files);
            event.target.value = "";
          }}
        />
        <Button type="button" variant="outline" size="sm" asChild>
          <label htmlFor="signup-portfolio-photos">
            <ImagePlus className="size-4" /> Add photos
          </label>
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Intro video</Label>
        <p className="text-xs text-muted-foreground">
          One short clip, up to {MAX_VIDEO_MB}MB — introduce yourself and your standards.
        </p>
        {videoPreview ? (
          <div className="space-y-2">
            <video src={videoPreview} controls className="w-full rounded-lg" />
            <Button type="button" variant="ghost" size="sm" onClick={() => onVideoChange(null)}>
              <X className="size-3.5" /> Remove video
            </Button>
          </div>
        ) : null}
        <input
          id="signup-portfolio-video"
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(event) => {
            void setVideo(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {videoPreview ? null : (
          <Button type="button" variant="outline" size="sm" asChild>
            <label htmlFor="signup-portfolio-video">
              <Film className="size-4" /> Choose video
            </label>
          </Button>
        )}
      </div>
    </div>
  );
}
