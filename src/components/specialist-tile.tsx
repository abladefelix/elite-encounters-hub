import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

import { useStoredMedia } from "@/lib/queries";
import { TILE_ASPECT_CLASS, useAppearance } from "@/lib/appearance";
import { cn } from "@/lib/utils";
import { initials, type Specialist } from "@/lib/types";

/**
 * Compact image-first tile for the specialist directory. All the detail lives on
 * the profile page — the grid only shows the photo and the name. The face crop
 * follows the appearance settings an admin picks in the control room.
 */
export function SpecialistTile({ specialist }: { specialist: Specialist }) {
  const { appearance } = useAppearance();
  const { data: media } = useStoredMedia(
    specialist.avatarPath ? [{ bucket: "avatars" as const, value: specialist.avatarPath }] : [],
  );
  const avatarUrl = specialist.avatarPath ? media?.[specialist.avatarPath] : undefined;

  return (
    <Link
      to="/specialists/$specialistId"
      params={{ specialistId: specialist.id }}
      className="group relative block overflow-hidden rounded-lg border border-border/70 bg-surface-strong transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevated"
    >
      <div
        className={cn(
          "w-full overflow-hidden",
          TILE_ASPECT_CLASS[appearance.tileAspect] ?? TILE_ASPECT_CLASS.square,
        )}
      >

        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={`${specialist.name}, vetted ash specialist in ${specialist.city}`}
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-panel font-display text-2xl font-semibold text-muted-foreground">
            {initials(specialist.name)}
          </div>
        )}
      </div>

      {specialist.online ? (
        <span className="absolute right-2 top-2 size-2.5 rounded-full border border-card bg-success" />
      ) : null}

      <div className="flex items-center gap-1 px-2 py-2">
        <p className="truncate text-xs font-medium">{specialist.name}</p>
        {specialist.verified ? (
          <ShieldCheck className="size-3 shrink-0 text-accent" />
        ) : null}
      </div>
    </Link>
  );
}
