import { cn } from "@/lib/utils";
import { TIER_LABEL, type Tier } from "@/lib/types";

const styles: Record<Tier, string> = {
  basic: "border-tier-basic/40 text-tier-basic bg-tier-basic/10",
  premium: "border-tier-premium/40 text-tier-premium bg-tier-premium/10",
  ultimate: "border-tier-ultimate/45 text-tier-ultimate bg-tier-ultimate/10",
};

export function TierBadge({
  tier,
  className,
  withRoom = false,
}: {
  tier: Tier;
  className?: string;
  withRoom?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em]",
        styles[tier],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {TIER_LABEL[tier]}
      {withRoom ? " Room" : ""}
    </span>
  );
}
