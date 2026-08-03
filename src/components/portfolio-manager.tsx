/**
 * Portfolio manager for the member profile page.
 *
 * Lets a specialist review the work photos and intro clip clients see, add or
 * remove photos, and swap the video. Files upload straight to the private
 * portfolio bucket; the paths are saved through a server function because
 * `profiles.extra` isn't writable from the browser.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Film, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MAX_PHOTO_MB,
  MAX_PORTFOLIO_PHOTOS,
  MAX_VIDEO_MB,
  MAX_VIDEO_SECONDS,
} from "@/components/portfolio-picker";
import { VideoThumbnail } from "@/components/video-thumbnail";
import { UploadProgressList } from "@/components/upload-progress-list";
import { useUploadQueue } from "@/hooks/use-upload-queue";
import { validateMediaFile } from "@/lib/media-validation";
import { safeName } from "@/lib/upload-progress";
import { getMyPortfolio, saveMyPortfolio } from "@/lib/specialist-media.functions";

export function PortfolioManager({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const uploads = useUploadQueue();

  const { data, isLoading } = useQuery({
    queryKey: ["my-portfolio", userId],
    retry: 1,
    queryFn: () => getMyPortfolio({}),
  });

  const save = useMutation({
    mutationFn: (input: { photoPaths: string[]; videoPath: string | null }) =>
      saveMyPortfolio({ data: input }),
    onSuccess: (result) => {
      queryClient.setQueryData(["my-portfolio", userId], result);
      void queryClient.invalidateQueries({ queryKey: ["specialist-media", userId] });
    },
  });

  const photos = data?.photos ?? [];
  const video = data?.video ?? null;

  async function commit(photoPaths: string[], videoPath: string | null) {
    try {
      await save.mutateAsync({ photoPaths, videoPath });
      toast.success("Gallery updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update your gallery");
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const incoming = Array.from(files);
    const room = MAX_PORTFOLIO_PHOTOS - photos.length;
    if (room <= 0) {
      toast.error(`You can show up to ${MAX_PORTFOLIO_PHOTOS} photos.`);
      return;
    }
    const chosen = incoming.slice(0, room);
    for (const file of chosen) {
      const problem = await validateMediaFile(file, { kind: "image", maxMB: MAX_PHOTO_MB });
      if (problem) {
        toast.error(problem);
        return;
      }
    }
    // Each file gets its own progress row, so one failure can be retried
    // without re-picking the whole batch.
    for (const file of chosen) {
      uploads.start({
        bucket: "attachments",
        path: `${userId}/portfolio/photo-${Date.now()}-${safeName(file.name)}`,
        file,
        onStored: async (storedPath) => {
          const current =
            (queryClient.getQueryData(["my-portfolio", userId]) as
              | { photos: { path: string }[]; video: { path: string } | null }
              | undefined) ?? { photos, video };
          await commit(
            [...current.photos.map((photo) => photo.path), storedPath],
            current.video?.path ?? null,
          );
        },
      });
    }
  }

  async function replaceVideo(file: File | undefined) {
    if (!file) return;
    const problem = await validateMediaFile(file, {
      kind: "video",
      maxMB: MAX_VIDEO_MB,
      maxSeconds: MAX_VIDEO_SECONDS,
    });
    if (problem) {
      toast.error(problem);
      return;
    }
    uploads.start({
      bucket: "attachments",
      path: `${userId}/portfolio/video-${Date.now()}-${safeName(file.name)}`,
      file,
      onStored: async (storedPath) => {
        await commit(
          photos.map((photo) => photo.path),
          storedPath,
        );
      },
    });
  }

  return (
    <Card className="border-border/70 bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Work gallery</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Clients browse these photos and your intro clip on your profile. Up to{" "}
            {MAX_PORTFOLIO_PHOTOS} photos, {MAX_PHOTO_MB}MB each.
          </p>
        </div>
        {uploads.busy || save.isPending ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      <UploadProgressList
        tasks={uploads.tasks}
        onRetry={uploads.retry}
        onCancel={uploads.cancel}
        onDismiss={uploads.dismiss}
        className="mt-4"
      />

      {isLoading ? (
        <Skeleton className="mt-4 h-32 w-full rounded-lg" />
      ) : (
        <div className="mt-4 space-y-4">
          {photos.length ? (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo, index) => (
                <div key={photo.path} className="relative overflow-hidden rounded-lg">
                  <img
                    src={photo.url}
                    alt={`Work photo ${index + 1}`}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label={`Remove work photo ${index + 1}`}
                    disabled={uploads.busy || save.isPending}
                    onClick={() =>
                      void commit(
                        photos.filter((item) => item.path !== photo.path).map((item) => item.path),
                        video?.path ?? null,
                      )
                    }
                    className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-background/85 text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No photos yet — add a few finished cleans so clients know what to expect.
            </p>
          )}

          <input
            id="profile-portfolio-photos"
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
            <label htmlFor="profile-portfolio-photos">
              <ImagePlus className="size-4" /> Add photos
            </label>
          </Button>

          <div className="space-y-2 border-t border-border/70 pt-4">
            <p className="text-sm font-medium">Intro video</p>
            {video ? (
              <div className="space-y-2">
                <VideoThumbnail url={video.url} />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={uploads.busy || save.isPending}
                  onClick={() => void commit(photos.map((photo) => photo.path), null)}
                >
                  <X className="size-3.5" /> Remove video
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                One short clip, up to {MAX_VIDEO_MB}MB.
              </p>
            )}
            <input
              id="profile-portfolio-video"
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(event) => {
                void replaceVideo(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" asChild>
              <label htmlFor="profile-portfolio-video">
                <Film className="size-4" /> {video ? "Replace video" : "Choose video"}
              </label>
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
