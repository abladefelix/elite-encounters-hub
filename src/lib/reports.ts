import { useCallback, useEffect, useState } from "react";

import type { Tier } from "./types";

/**
 * Member reports and star ratings raised from the chat thread.
 *
 * Both live in localStorage for now, behind the same event-driven store shape
 * as the moderation log, so the admin dashboard sees new entries instantly.
 * Swap the read/write helpers for backend calls when the API lands.
 */

/* ------------------------------------------------------------------ reports */

export type ReportReason =
  | "off_platform"
  | "harassment"
  | "no_show"
  | "poor_service"
  | "payment"
  | "fake_profile"
  | "other";

export const REPORT_REASONS: { id: ReportReason; label: string; hint: string }[] = [
  {
    id: "off_platform",
    label: "Taking the deal off-platform",
    hint: "Asking to pay or arrange outside Ashnight escrow.",
  },
  {
    id: "harassment",
    label: "Harassment or abusive language",
    hint: "Threats, insults, sexual or discriminatory messages.",
  },
  { id: "no_show", label: "No-show or repeated lateness", hint: "Booked visit was missed." },
  {
    id: "poor_service",
    label: "Ash quality far below standard",
    hint: "Work not completed as scoped.",
  },
  { id: "payment", label: "Payment or escrow problem", hint: "Pressure to release funds early." },
  { id: "fake_profile", label: "Fake or misleading profile", hint: "Identity or photos don't match." },
  { id: "other", label: "Something else", hint: "Describe it and we'll review the thread." },
];

export const REPORT_REASON_LABEL = Object.fromEntries(
  REPORT_REASONS.map((reason) => [reason.id, reason.label]),
) as Record<ReportReason, string>;

export type ReportStatus = "open" | "reviewing" | "actioned" | "dismissed";

export interface MemberReport {
  id: string;
  at: string;
  threadId: string;
  reporterId: string;
  reportedId: string;
  reportedName: string;
  room: Tier;
  reason: ReportReason;
  details: string;
  /** Last few messages from the thread, captured for context. */
  excerpt: string;
  blocked: boolean;
  status: ReportStatus;
}

const REPORT_KEY = "ashnight-member-reports";
const REPORT_EVENT = "ashnight-member-reports-change";
const MAX_REPORTS = 200;

function read<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, event: string, rows: T[], max: number) {
  try {
    window.localStorage.setItem(key, JSON.stringify(rows.slice(0, max)));
    window.dispatchEvent(new CustomEvent(event));
  } catch {
    /* storage unavailable */
  }
}

function useStore<T>(key: string, event: string) {
  const [rows, setRows] = useState<T[]>([]);
  useEffect(() => {
    const sync = () => setRows(read<T>(key));
    sync();
    window.addEventListener(event, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(event, sync);
      window.removeEventListener("storage", sync);
    };
  }, [key, event]);
  return [rows, setRows] as const;
}

/** File one report for admin review. */
export function fileReport(
  input: Omit<MemberReport, "id" | "at" | "status">,
): MemberReport {
  const report: MemberReport = {
    ...input,
    id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    status: "open",
  };
  write(REPORT_KEY, REPORT_EVENT, [report, ...read<MemberReport>(REPORT_KEY)], MAX_REPORTS);
  return report;
}

/** Live view of member reports, for the admin dashboard. */
export function useReports() {
  const [reports] = useStore<MemberReport>(REPORT_KEY, REPORT_EVENT);

  const setStatus = useCallback((id: string, status: ReportStatus) => {
    write(
      REPORT_KEY,
      REPORT_EVENT,
      read<MemberReport>(REPORT_KEY).map((report) =>
        report.id === id ? { ...report, status } : report,
      ),
      MAX_REPORTS,
    );
  }, []);

  const remove = useCallback((id: string) => {
    write(
      REPORT_KEY,
      REPORT_EVENT,
      read<MemberReport>(REPORT_KEY).filter((report) => report.id !== id),
      MAX_REPORTS,
    );
  }, []);

  const clear = useCallback(() => write(REPORT_KEY, REPORT_EVENT, [], MAX_REPORTS), []);

  return { reports, setStatus, remove, clear };
}

/* ------------------------------------------------------------------ ratings */

export interface ChatRating {
  id: string;
  at: string;
  threadId: string;
  authorId: string;
  specialistId: string;
  specialistName: string;
  stars: number;
  note: string;
  tags: string[];
}

export const RATING_TAGS = [
  "On time",
  "Thorough ash",
  "Great communication",
  "Careful with things",
  "Brought own supplies",
  "Would rebook",
];

export const STAR_LABEL: Record<number, string> = {
  1: "Poor",
  2: "Below par",
  3: "Fine",
  4: "Great",
  5: "Exceptional",
};

const RATING_KEY = "ashnight-chat-ratings";
const RATING_EVENT = "ashnight-chat-ratings-change";
const MAX_RATINGS = 200;

/** Save a star rating raised from a chat thread. */
export function saveRating(input: Omit<ChatRating, "id" | "at">): ChatRating {
  const rating: ChatRating = {
    ...input,
    id: `rate-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
  };
  write(RATING_KEY, RATING_EVENT, [rating, ...read<ChatRating>(RATING_KEY)], MAX_RATINGS);
  return rating;
}

/** Live view of chat ratings, with per-thread helpers. */
export function useRatings() {
  const [ratings] = useStore<ChatRating>(RATING_KEY, RATING_EVENT);

  const forThread = useCallback(
    (threadId: string) => ratings.filter((rating) => rating.threadId === threadId),
    [ratings],
  );

  const averageFor = useCallback(
    (specialistId: string) => {
      const mine = ratings.filter((rating) => rating.specialistId === specialistId);
      if (!mine.length) return null;
      return mine.reduce((sum, rating) => sum + rating.stars, 0) / mine.length;
    },
    [ratings],
  );

  const remove = useCallback((id: string) => {
    write(
      RATING_KEY,
      RATING_EVENT,
      read<ChatRating>(RATING_KEY).filter((rating) => rating.id !== id),
      MAX_RATINGS,
    );
  }, []);

  return { ratings, forThread, averageFor, remove };
}
