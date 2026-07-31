import { cn } from "@/lib/utils";
import { TIER_LABEL, type Tier } from "@/lib/types";
import { ROOM_ACCENTS, useRoomAccent } from "@/lib/room-settings";
import { Crown, Gem, Star } from "lucide-react";

const TIER_ICON: Record<Tier, typeof Star> = {
  basic: Star,
  premium: Gem,
  ultimate: Crown,
};

export function TierBadge({
  tier,
  className,
  withRoom = false,
  showIcon = false,
}: {
  tier: Tier;
  className?: string;
  withRoom?: boolean;
  showIcon?: boolean;
}) {
  const accent = useRoomAccent(tier);
  const entry = ROOM_ACCENTS[accent];
  const Icon = TIER_ICON[tier];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em]",
        className,
      )}
      style={{
        color: entry.color,
        borderColor: `color-mix(in oklab, ${entry.color} 35%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${entry.color} 10%, transparent)`,
      }}
    >
      {showIcon ? (
        <Icon className="size-3" strokeWidth={2.5} />
      ) : (
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: entry.color }}
        />
      )}
      {TIER_LABEL[tier]}
      {withRoom ? " Room" : ""}
    </span>
  );
}
