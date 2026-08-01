/**
 * Client-side pagination for the long admin and member lists.
 *
 * `usePaged` slices any array and keeps the current page valid when filters
 * shrink the result set; `<DataPager />` renders the matching control bar.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export interface Paged<T> {
  /** Rows for the current page. */
  rows: T[];
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  pageCount: number;
  total: number;
  from: number;
  to: number;
}

export function usePaged<T>(all: T[], initialSize = 25): Paged<T> {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);

  const total = all.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const current = Math.min(page, pageCount);
  const rows = useMemo(
    () => all.slice((current - 1) * pageSize, current * pageSize),
    [all, current, pageSize],
  );

  return {
    rows,
    page: current,
    setPage,
    pageSize,
    setPageSize: (size: number) => {
      setPageSize(size);
      setPage(1);
    },
    pageCount,
    total,
    from: total === 0 ? 0 : (current - 1) * pageSize + 1,
    to: Math.min(current * pageSize, total),
  };
}

export function DataPager<T>({
  paged,
  label = "items",
  className = "",
}: {
  paged: Paged<T>;
  label?: string;
  className?: string;
}) {
  if (paged.total === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground ${className}`}
    >
      <p>
        Showing {paged.from}–{paged.to} of {paged.total} {label}
      </p>
      <div className="flex items-center gap-2">
        <Select
          value={String(paged.pageSize)}
          onValueChange={(value) => paged.setPageSize(Number(value))}
        >
          <SelectTrigger className="h-8 w-[110px] text-xs" aria-label="Rows per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2"
          disabled={paged.page <= 1}
          onClick={() => paged.setPage(paged.page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-[72px] text-center tabular-nums">
          Page {paged.page} / {paged.pageCount}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2"
          disabled={paged.page >= paged.pageCount}
          onClick={() => paged.setPage(paged.page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
