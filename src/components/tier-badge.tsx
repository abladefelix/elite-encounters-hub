import { cn } from "@/lib/utils";
import { TIER_LABEL, type Tier } from "@/lib/types";
import { ROOM_ACCENTS, useRoomAccent } from "@/lib/room-settings";

export function TierBadge({
  tier,
  className,
  withRoom = false,
}: {
  tier: Tier;
  className?: string;
  withRoom?: boolean;
}) {
  const accent = useRoomAccent(tier);
  const entry = ROOM_ACCENTS[accent];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em]",
        className,
      )}
      style={{
        color: entry.color,
        borderColor: `color-mix(in oklab, ${entry.color} 40%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${entry.color} 12%, transparent)`,
      }}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {TIER_LABEL[tier]}
      {withRoom ? " Room" : ""}
    </span>
  );
}
