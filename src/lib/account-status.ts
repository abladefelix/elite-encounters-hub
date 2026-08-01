/**
 * Account state shared by the member app and the control room.
 *
 * Kept client-safe (no server imports) so both sides describe a ban, suspension
 * or reactivation with exactly the same words.
 */
import type { Database } from "@/integrations/supabase/types";

export type AccountStatus = Database["public"]["Enums"]["account_status"];

export const ACCOUNT_STATUSES: AccountStatus[] = [
  "pending",
  "active",
  "deactivated",
  "suspended",
  "banned",
];

export const ACCOUNT_STATUS_META: Record<
  AccountStatus,
  { label: string; blurb: string; tone: "muted" | "good" | "warn" | "bad" }
> = {
  pending: {
    label: "Pending",
    blurb: "Signed up, waiting on vetting.",
    tone: "muted",
  },
  active: {
    label: "Active",
    blurb: "Full access to their room.",
    tone: "good",
  },
  deactivated: {
    label: "Deactivated",
    blurb: "Closed by request. Sign-in is off until reactivated.",
    tone: "warn",
  },
  suspended: {
    label: "Suspended",
    blurb: "Temporarily blocked while under review.",
    tone: "warn",
  },
  banned: {
    label: "Banned",
    blurb: "Permanently closed. Sessions revoked.",
    tone: "bad",
  },
};

export const BLOCKING_STATUSES: AccountStatus[] = ["deactivated", "suspended", "banned"];

export function isBlocked(status: AccountStatus | null | undefined) {
  return !!status && BLOCKING_STATUSES.includes(status);
}

export function statusBadgeClass(status: AccountStatus) {
  const tone = ACCOUNT_STATUS_META[status].tone;
  if (tone === "good") return "border-primary/40 bg-primary/10 text-primary";
  if (tone === "warn") return "border-amber-500/40 bg-amber-500/10 text-amber-600";
  if (tone === "bad") return "border-destructive/40 bg-destructive/10 text-destructive";
  return "border-border bg-muted text-muted-foreground";
}

/** Ghana card numbers are printed as GHA-123456789-0. */
export function formatGhanaCard(raw: string) {
  const value = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!value.startsWith("GHA")) return raw.trim().toUpperCase();
  const digits = value.slice(3);
  if (digits.length <= 9) return `GHA-${digits}`;
  return `GHA-${digits.slice(0, 9)}-${digits.slice(9, 10)}`;
}

export const GHANA_CARD_HINT = "Format: GHA-123456789-0";

export function isGhanaCardShaped(raw: string) {
  const value = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return /^GHA[0-9]{9,12}$/.test(value);
}

/** One strict email rule for the whole app. */
export const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

export function isEmailShaped(value: string) {
  const trimmed = value.trim();
  return trimmed.length <= 254 && EMAIL_PATTERN.test(trimmed);
}
