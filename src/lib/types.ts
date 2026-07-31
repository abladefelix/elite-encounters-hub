/**
 * Ashnight domain types.
 *
 * Single source of truth for both the client app and the admin dashboard.
 * Keeping these here means the mock data layer can be swapped for a real
 * backend without touching UI components.
 */

export type Tier = "basic" | "premium" | "ultimate";

export type VettingStatus = "pending" | "in_review" | "approved" | "rejected";

export type UserRole = "client" | "specialist" | "admin";

export type BookingStatus =
  | "requested"
  | "accepted"
  | "paid"
  | "completed"
  | "cancelled"
  | "disputed";

export interface Room {
  id: Tier;
  name: string;
  tagline: string;
  priceMonthly: number;
  perks: string[];
  visitFeeRange: [number, number];
  specialistCount: number;
  seatsLeft: number;
}

export interface Specialist {
  id: string;
  name: string;
  city: string;
  room: Tier;
  headline: string;
  bio: string;
  rating: number;
  jobsCompleted: number;
  hourlyRate: number;
  yearsExperience: number;
  services: string[];
  languages: string[];
  verified: boolean;
  online: boolean;
  responseMinutes: number;
}

export interface Client {
  id: string;
  name: string;
  city: string;
  room: Tier;
  joined: string;
  subscriptionStatus: "active" | "past_due" | "cancelled";
  lifetimeSpend: number;
  bookings: number;
}

export interface Applicant {
  id: string;
  name: string;
  role: Exclude<UserRole, "admin">;
  city: string;
  appliedAt: string;
  status: VettingStatus;
  idVerified: boolean;
  backgroundCheck: "clear" | "pending" | "flagged";
  referenceChecks: number;
  suggestedRoom: Tier;
  note: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  authorId: string;
  body: string;
  at: string;
  kind: "text" | "system" | "booking" | "gift";
  bookingId?: string;
  /** Escrow ledger row this message refers to, for booking/gift messages. */
  escrowId?: string;
}

export interface Thread {
  id: string;
  specialistId: string;
  clientId: string;
  lastMessage: string;
  lastAt: string;
  unread: number;
}

export interface Booking {
  id: string;
  threadId: string;
  clientId: string;
  specialistId: string;
  service: string;
  scheduledFor: string;
  hours: number;
  rate: number;
  addons: string[];
  status: BookingStatus;
  platformFeePct: number;
}

export const TIER_LABEL: Record<Tier, string> = {
  basic: "Basic",
  premium: "Premium",
  ultimate: "Ultimate",
};

export function bookingTotal({
  hours,
  rate,
  platformFeePct,
}: Pick<Booking, "hours" | "rate" | "platformFeePct">) {
  const subtotal = hours * rate;
  const fee = Math.round(subtotal * (platformFeePct / 100));
  return { subtotal, fee, total: subtotal + fee };
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function money(amount: number) {
  return amount.toLocaleString("en-GH", {
    style: "currency",
    currency: "GHS",
    maximumFractionDigits: 0,
  });
}
