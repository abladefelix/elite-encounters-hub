import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Compact page list with ellipses: 1 … 4 5 6 … 20 */
function pageList(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((page) => pages.add(page));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((page) => pages.add(page));
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - (sorted[index - 1] as number) > 1) out.push("gap");
    out.push(page);
  });
  return out;
}

export function RosterPagination({
  page,
  pageCount,
  total,
  from,
  to,
  onPageChange,
  className,
  itemLabel = "specialists",
}: {
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
  onPageChange: (page: number) => void;
  className?: string;
  itemLabel?: string;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav
      aria-label={`${itemLabel} pagination`}
      className={cn(
        "mt-8 flex flex-col items-center gap-4 rounded-xl border border-border/70 bg-surface px-4 py-4 sm:flex-row sm:justify-between",
        className,
      )}
    >
      <p className="text-xs text-muted-foreground">
        Showing <span className="font-medium text-foreground">{from}</span>–
        <span className="font-medium text-foreground">{to}</span> of{" "}
        <span className="font-medium text-foreground">{total}</span> {itemLabel}
      </p>

      <div className="flex items-center gap-1">
        <Button
          variant="soft"
          size="icon"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-4" />
        </Button>

        <div className="flex items-center gap-1">
          {pageList(page, pageCount).map((item, index) =>
            item === "gap" ? (
              <span
                key={`gap-${index}`}
                className="px-1 text-xs text-muted-foreground"
                aria-hidden="true"
              >
                …
              </span>
            ) : (
              <Button
                key={item}
                size="icon"
                variant={item === page ? "brass" : "ghost"}
                aria-current={item === page ? "page" : undefined}
                aria-label={`Page ${item}`}
                className="size-9 text-xs font-medium"
                onClick={() => onPageChange(item)}
              >
                {item}
              </Button>
            ),
          )}
        </div>

        <Button
          variant="soft"
          size="icon"
          aria-label="Next page"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </nav>
  );
}
