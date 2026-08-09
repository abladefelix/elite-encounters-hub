/**
 * Where a member wants their invoices and receipts delivered.
 *
 * The choice lives on `profiles.extra.documentDelivery` so the member owns it,
 * exactly like call preferences. Nothing here is a simulation: email goes out
 * through the platform sender configured in Control room → Email & domain, and
 * WhatsApp goes out through the WhatsApp Cloud API credentials stored in the
 * admin key vault. If a channel is not configured yet, the delivery is recorded
 * as skipped instead of pretending to have been sent.
 */
import { useSettingsSection } from "@/lib/platform-settings";

export type DeliveryChannel = "email" | "whatsapp";

export interface DocumentDeliveryPreferences {
  /** Email the paperwork to the address on the account. */
  email: boolean;
  /** Send the paperwork over WhatsApp. */
  whatsapp: boolean;
  /** WhatsApp number, when it differs from the account phone number. */
  whatsappNumber: string;
}

export const DEFAULT_DOCUMENT_DELIVERY: DocumentDeliveryPreferences = {
  email: true,
  whatsapp: false,
  whatsappNumber: "",
};

/** Reads delivery preferences out of the loose `extra` JSON on a profile row. */
export function readDocumentDelivery(extra: unknown): DocumentDeliveryPreferences {
  const source =
    extra && typeof extra === "object" && !Array.isArray(extra)
      ? ((extra as Record<string, unknown>)["documentDelivery"] as
          | Record<string, unknown>
          | undefined)
      : undefined;
  if (!source) return { ...DEFAULT_DOCUMENT_DELIVERY };
  return {
    email: typeof source["email"] === "boolean" ? (source["email"] as boolean) : true,
    whatsapp: typeof source["whatsapp"] === "boolean" ? (source["whatsapp"] as boolean) : false,
    whatsappNumber:
      typeof source["whatsappNumber"] === "string" ? (source["whatsappNumber"] as string) : "",
  };
}

/**
 * Normalises a Ghanaian (or already international) number to the digits-only
 * MSISDN the WhatsApp Cloud API expects, e.g. 233241234567.
 */
export function toWhatsAppMsisdn(input: string): string {
  const digits = (input ?? "").replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.startsWith("233")) return digits;
  if (digits.startsWith("0")) return `233${digits.slice(1)}`;
  return digits;
}

export function describeDelivery(prefs: DocumentDeliveryPreferences): string {
  if (prefs.email && prefs.whatsapp) return "Email and WhatsApp";
  if (prefs.whatsapp) return "WhatsApp only";
  if (prefs.email) return "Email only";
  return "In the app only";
}

/* ------------------------------------------------------- admin-side settings */

export interface DeliverySettings {
  /** Master switch for sending paperwork outside the app at all. */
  enabled: boolean;
  /** Master switch for the email channel. */
  emailEnabled: boolean;
  /** Master switch for the WhatsApp channel. */
  whatsappEnabled: boolean;
  /** Fall back to email when a WhatsApp send is not possible. */
  whatsappFallbackToEmail: boolean;
  /** Sender label used in the WhatsApp message body. */
  whatsappSenderName: string;
}

export const DEFAULT_DELIVERY_SETTINGS: DeliverySettings = {
  enabled: true,
  emailEnabled: true,
  whatsappEnabled: false,
  whatsappFallbackToEmail: true,
  whatsappSenderName: "Ashnight",
};

export function useDeliverySettings() {
  return useSettingsSection<DeliverySettings>("delivery", DEFAULT_DELIVERY_SETTINGS);
}
