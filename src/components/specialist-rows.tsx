/**
 * Swipeable roster rows.
 *
 * Members browse faces the way they browse a streaming catalogue: one
 * horizontally swipeable row per group (available now, top rated, new…). Which
 * rows appear, how many faces each holds and the face crop are all admin
 * settings from the control room.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useRef } from "react";

import { Button } from "@/components/ui/button";
import { SpecialistTile } from "@/components/specialist-tile";
import { DENSITY_GAP, ROSTER_GROUPS, useAppearance } from "@/lib/appearance";
import type { Specialist } from "@/lib/types";

/** Fisher-Yates shuffle on a copy, so rows never mutate the caller's roster. */
function shuffled<T>(list: T[]) {
  const next = [...list];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [next[index], next[swap]] = [next[swap] as T, next[index] as T];
  }
  return next;
}

/** Splits a roster into the admin-selected groups, dropping empty ones. */
export function groupRoster(roster: Specialist[], groups: readonly string[]) {
  const byKey: Record<string, Specialist[]> = {
    online: roster.filter((s) => s.online),
    top: [...roster].sort((a, b) => b.rating - a.rating),
    new: [...roster].sort((a, b) => b.jobsCompleted - a.jobsCompleted).reverse(),
    affordable: [...roster].sort((a, b) => a.hourlyRate - b.hourlyRate),
  };
  return groups
    .map((key) => ({
      key,
      label: ROSTER_GROUPS.find((group) => group.key === key)?.label ?? key,
      items: byKey[key] ?? [],
    }))
    .filter((row) => row.items.length > 0);
}

function SwipeRow({
  label,
  items,
  gap,
}: {
  label: string;
  items: Specialist[];
  gap: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  function nudge(direction: -1 | 1) {
    const node = scroller.current;
    if (!node) return;
    node.scrollBy({ left: direction * Math.max(200, node.clientWidth * 0.8), behavior: "smooth" });
  }

  return (
    <section>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h3 className="min-w-0 truncate font-display text-base font-semibold sm:text-lg">
          {label}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{items.length}</span>
        </h3>
        <div className="hidden shrink-0 items-center gap-1 sm:flex">
          <Button
            variant="soft"
            size="icon"
            aria-label={`Scroll ${label} left`}
            onClick={() => nudge(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="soft"
            size="icon"
            aria-label={`Scroll ${label} right`}
            onClick={() => nudge(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scroller}
        className="-mx-5 mt-3 flex snap-x snap-mandatory overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
        style={{ gap }}
      >
        {items.map((specialist) => (
          <div key={specialist.id} className="w-28 shrink-0 snap-start sm:w-32">
            <SpecialistTile specialist={specialist} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function SpecialistRows({
  roster,
  showBrowseAll = false,
  leadRow,
}: {
  roster: Specialist[];
  showBrowseAll?: boolean;
  /** Optional first row — used to keep the member's own filters and sort visible. */
  leadRow?: { label: string; items: Specialist[] };
}) {
  const { appearance } = useAppearance();
  const gap = DENSITY_GAP[appearance.density] ?? DENSITY_GAP.cozy;
  const limit = Math.max(4, appearance.rowSize);
  // Shuffling is re-rolled per mount so the strips look different each visit,
  // but stays stable while the member scrolls and taps through.
  const rows = useMemo(() => {
    const grouped = groupRoster(roster, appearance.rosterGroups).map((row) => ({
      ...row,
      // A shuffled row samples the whole group instead of always the same head.
      items: (appearance.shuffleRows ? shuffled(row.items) : row.items).slice(0, limit),
    }));
    // The lead row always keeps the member's chosen sort order — never shuffled.
    return leadRow && leadRow.items.length
      ? [{ key: "__lead", label: leadRow.label, items: leadRow.items.slice(0, limit) }, ...grouped]
      : grouped;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, appearance.rosterGroups, appearance.shuffleRows, limit, leadRow?.label, leadRow?.items]);

  if (!rows.length) return null;

  return (
    <div className="space-y-7">
      {rows.map((row) => (
        <SwipeRow key={row.key} label={row.label} items={row.items} gap={gap} />
      ))}

      {showBrowseAll ? (
        <Button asChild variant="soft" size="sm">
          <Link to="/specialists">
            Browse the full roster <ArrowRight className="size-4" />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
