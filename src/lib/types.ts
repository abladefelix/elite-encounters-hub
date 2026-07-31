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
  photo: string;
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
  photo: string;
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
  photo: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  authorId: string;
  body: string;
  at: string;
  kind: "text" | "system" | "booking";
  bookingId?: string;
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

export function bookingTotal(booking: Pick<Booking, "hours" | "rate" | "platformFeePct">) {
  const subtotal = booking.hours * booking.rate;
  const fee = Math.round(subtotal * booking.platformFeePct) / 100;
  return { subtotal, fee: Math.round(subtotal * (booking.platformFeePct / 100)), total: subtotal + fee };
}
