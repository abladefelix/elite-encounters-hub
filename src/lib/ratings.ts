/**
 * Post-service feedback: which visits still need a client rating, and what the
 * collected ratings say about a specialist's room placement.
 *
 * Ratings are the only performance signal Ashnight trusts for room moves, so
 * everything here derives from real rows (bookings, escrow, ratings) — never
 * from a guess or a local cache.
 */
import type { BookingRow, EscrowRow, ProfileRow, RatingRow } from "@/lib/queries";
import type { Tier } from "@/lib/types";

/** A finished, paid visit a client hasn't reviewed yet. */
export interface PendingReview {
  bookingId: string | null;
  threadId: string | null;
  specialistId: string;
  serviceName: string;
  /** When the job became reviewable (completion / escrow clearing). */
  at: string;
  amount: number;
}

/** Escrow states that mean the client has taken delivery of the service. */
const SERVED_STATES = new Set(["clearing", "released"]);

/**
 * Visits this client can still rate. A visit is reviewable once the booking is
 * completed or its escrow entry has left the hold window, and it drops off the
 * list as soon as a rating exists for that booking (or for that specialist,
 * when the rating was left from chat without a booking reference).
 */
export function pendingReviews({
  userId,
  bookings,
  escrows,
  ratings,
}: {
  userId: string;
  bookings: BookingRow[];
  escrows: EscrowRow[];
  ratings: RatingRow[];
}): PendingReview[] {
  const mine = ratings.filter((rating) => rating.rater_id === userId);
  const ratedBookings = new Set(
    mine.map((rating) => rating.booking_id).filter((id): id is string => Boolean(id)),
  );
  const ratedSpecialistsWithoutBooking = new Set(
    mine.filter((rating) => !rating.booking_id).map((rating) => rating.rated_id),
  );

  const escrowByBooking = new Map<string, EscrowRow>();
  for (const entry of escrows) {
    if (entry.kind !== "booking" || !entry.booking_id) continue;
    escrowByBooking.set(entry.booking_id, entry);
  }

  const result: PendingReview[] = [];

  for (const booking of bookings) {
    if (booking.client_id !== userId) continue;
    if (ratedBookings.has(booking.id)) continue;
    const entry = escrowByBooking.get(booking.id);
    const served = booking.status === "completed" || (entry ? SERVED_STATES.has(entry.state) : false);
    if (!served) continue;
    result.push({
      bookingId: booking.id,
      threadId: booking.thread_id,
      specialistId: booking.specialist_id,
      serviceName: booking.service_name || "Ashnight visit",
      at: entry?.released_at ?? entry?.paid_at ?? booking.updated_at ?? booking.created_at,
      amount: entry?.amount ?? Math.round(booking.rate * booking.hours),
    });
  }

  // Escrow rows paid outside a booking (admin-entered visits) are reviewable too.
  for (const entry of escrows) {
    if (entry.client_id !== userId) continue;
    if (entry.kind !== "booking" || entry.booking_id) continue;
    if (!SERVED_STATES.has(entry.state)) continue;
    if (ratedSpecialistsWithoutBooking.has(entry.specialist_id)) continue;
    result.push({
      bookingId: null,
      threadId: entry.thread_id,
      specialistId: entry.specialist_id,
      serviceName: entry.label || "Ashnight visit",
      at: entry.released_at ?? entry.paid_at ?? entry.created_at,
      amount: entry.amount,
    });
  }

  return result.sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** Whether this client is allowed to rate this specialist at all. */
export function canReview({
  userId,
  specialistId,
  bookings,
  escrows,
}: {
  userId: string;
  specialistId: string;
  bookings: BookingRow[];
  escrows: EscrowRow[];
}) {
  const paidBooking = bookings.some(
    (booking) =>
      booking.client_id === userId &&
      booking.specialist_id === specialistId &&
      (booking.status === "completed" || booking.status === "paid"),
  );
  if (paidBooking) return true;
  return escrows.some(
    (entry) =>
      entry.client_id === userId &&
      entry.specialist_id === specialistId &&
      SERVED_STATES.has(entry.state),
  );
}

/* ------------------------------------------------------------- performance */

export interface FeedbackSummary {
  specialistId: string;
  count: number;
  average: number;
  /** Average across the six most recent ratings — the trend admins act on. */
  recentAverage: number;
  fiveStars: number;
  lowStars: number;
  tagCounts: { tag: string; count: number }[];
  lastRatedAt: string | null;
  notes: { stars: number; note: string; at: string }[];
}

const RECENT_WINDOW = 6;

export function summarizeFeedback(specialistId: string, ratings: RatingRow[]): FeedbackSummary {
  const rows = ratings
    .filter((rating) => rating.rated_id === specialistId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const average = rows.length
    ? rows.reduce((sum, row) => sum + row.stars, 0) / rows.length
    : 0;
  const recent = rows.slice(0, RECENT_WINDOW);
  const recentAverage = recent.length
    ? recent.reduce((sum, row) => sum + row.stars, 0) / recent.length
    : 0;

  const tally = new Map<string, number>();
  for (const row of rows) {
    for (const tag of row.tags ?? []) tally.set(tag, (tally.get(tag) ?? 0) + 1);
  }

  return {
    specialistId,
    count: rows.length,
    average: Math.round(average * 100) / 100,
    recentAverage: Math.round(recentAverage * 100) / 100,
    fiveStars: rows.filter((row) => row.stars === 5).length,
    lowStars: rows.filter((row) => row.stars <= 2).length,
    tagCounts: [...tally.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count),
    lastRatedAt: rows[0]?.created_at ?? null,
    notes: rows
      .filter((row) => row.note.trim().length > 0)
      .slice(0, 8)
      .map((row) => ({ stars: row.stars, note: row.note, at: row.created_at })),
  };
}

/** Minimum evidence before a room move should be considered at all. */
export const REVIEW_THRESHOLD = 3;

export interface TierAdvice {
  /** Suggested room, or null when there isn't enough evidence yet. */
  tier: Tier | null;
  /** Plain-language reason an admin can act on or ignore. */
  reason: string;
  tone: "promote" | "hold" | "review" | "thin";
}

/**
 * Room advice from real feedback. Ordered tiers come from the live room list so
 * custom rooms are respected: the top room needs sustained excellence, the
 * middle room solid performance, and weak recent scores pull a specialist back.
 */
export function tierAdvice({
  summary,
  jobsCompleted,
  currentRoom,
  tiers,
}: {
  summary: FeedbackSummary;
  jobsCompleted: number;
  currentRoom: Tier | null;
  tiers: Tier[];
}): TierAdvice {
  const ladder = tiers.length ? tiers : (["basic"] as Tier[]);
  const entry = ladder[0]!;
  const top = ladder[ladder.length - 1]!;
  const middle = ladder[Math.min(1, ladder.length - 1)]!;

  if (summary.count < REVIEW_THRESHOLD) {
    return {
      tier: null,
      reason: `Only ${summary.count} rating${summary.count === 1 ? "" : "s"} so far — needs ${
        REVIEW_THRESHOLD - summary.count
      } more before a room move.`,
      tone: "thin",
    };
  }

  if (summary.lowStars >= 2 || summary.recentAverage < 3) {
    return {
      tier: entry,
      reason: `Recent scores are weak (${summary.recentAverage.toFixed(1)} avg, ${
        summary.lowStars
      } low rating${summary.lowStars === 1 ? "" : "s"}). Move back to ${entry} and coach.`,
      tone: "review",
    };
  }

  if (summary.average >= 4.7 && summary.count >= 8 && jobsCompleted >= 8) {
    return {
      tier: top,
      reason: `${summary.average.toFixed(1)} across ${summary.count} ratings and ${jobsCompleted} completed jobs — ready for the top room.`,
      tone: currentRoom === top ? "hold" : "promote",
    };
  }

  if (summary.average >= 4.3) {
    return {
      tier: middle,
      reason: `Steady ${summary.average.toFixed(1)} average across ${summary.count} ratings — a good fit for ${middle}.`,
      tone: currentRoom === middle ? "hold" : "promote",
    };
  }

  return {
    tier: entry,
    reason: `${summary.average.toFixed(1)} average — keep in ${entry} until scores climb.`,
    tone: currentRoom === entry ? "hold" : "review",
  };
}

/** Convenience: build a summary map for many specialists in one pass. */
export function summarizeAll(profiles: ProfileRow[], ratings: RatingRow[]) {
  const map = new Map<string, FeedbackSummary>();
  for (const profile of profiles) map.set(profile.id, summarizeFeedback(profile.id, ratings));
  return map;
}
