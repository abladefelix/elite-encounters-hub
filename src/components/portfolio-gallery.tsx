/**
 * Read-only portfolio viewer shown on a specialist's public profile.
 *
 * Photos scroll in a swipeable carousel; the intro clip sits underneath. Media
 * arrives already signed from `getSpecialistMedia`, since the portfolio bucket
 * is private.
 */
import { useQuery } from "@tanstack/react-query";
import { Film, Images } from "lucide-react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { VideoThumbnail } from "@/components/video-thumbnail";
import { getSpecialistMedia } from "@/lib/specialist-media.functions";

export function PortfolioGallery({
  specialistId,
  name,
  enabled = true,
}: {
  specialistId: string;
  name: string;
  enabled?: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["specialist-media", specialistId],
    enabled,
    retry: 1,
    queryFn: () => getSpecialistMedia({ data: { specialistId } }),
  });

  if (!enabled) return null;

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  const photos = data?.photos ?? [];
  const video = data?.video ?? null;
  if (!photos.length && !video) return null;

  return (
    <Card className="border-border/70 bg-surface p-6">
      <h2 className="eyebrow flex items-center gap-2">
        <Images className="size-3.5" /> Work gallery
      </h2>

      {photos.length ? (
        <Carousel className="mt-4" opts={{ align: "start", loop: photos.length > 1 }}>
          <CarouselContent>
            {photos.map((photo, index) => (
              <CarouselItem key={photo.path} className="basis-full sm:basis-1/2">
                <img
                  src={photo.url}
                  alt={`${name} — work photo ${index + 1}`}
                  loading="lazy"
                  className="aspect-[4/3] w-full rounded-lg border border-border/60 object-cover"
                />
              </CarouselItem>
            ))}
          </CarouselContent>
          {photos.length > 1 ? (
            <>
              <CarouselPrevious className="left-2" />
              <CarouselNext className="right-2" />
            </>
          ) : null}
        </Carousel>
      ) : null}

      {photos.length > 1 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Swipe or use the arrows to browse all {photos.length} photos.
        </p>
      ) : null}

      {video ? (
        <div className="mt-6 space-y-2">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Film className="size-3.5" /> Intro video
          </p>
          <VideoThumbnail url={video.url} label={`${name} — intro video`} />
        </div>
      ) : null}

    </Card>
  );
}
