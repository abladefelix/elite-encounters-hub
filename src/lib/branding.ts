/**
 * Admin-owned brand identity.
 *
 * The name, taglines and logo used across the public site, the auth screens and
 * the control room all come from here, so a rebrand is an admin edit rather than
 * a code change. Stored in the shared platform settings row.
 */
import { useSettingsSection } from "./platform-settings";

export interface BrandingSettings {
  /** Wordmark shown next to the logo. */
  name: string;
  /** Short line under the name on the auth screens. */
  tagline: string;
  /** Longer positioning line used in the footer. */
  description: string;
  /** Footer legal / small-print line. */
  legalLine: string;
  /** Support mailbox surfaced in the control room and footer. */
  supportEmail: string;
  /** Optional custom logo. Empty falls back to the built-in brass mark. */
  logoUrl: string;
  /** Alt text for the custom logo. */
  logoAlt: string;
  /** Show the accent dot after the wordmark. */
  showAccentDot: boolean;
}

export const DEFAULT_BRANDING: BrandingSettings = {
  name: "Ashnight",
  tagline: "Members-only access to vetted ash dolls.",
  description:
    "A members-only ash services platform. Every specialist and every client is manually vetted before onboarding.",
  legalLine:
    "Residential and commercial ash services only. All bookings, scheduling and payments happen on-platform.",
  supportEmail: "trust@ashnight.example",
  logoUrl: "",
  logoAlt: "",
  showAccentDot: true,
};

export function useBranding() {
  const { value, save, loading } = useSettingsSection<BrandingSettings>(
    "branding",
    DEFAULT_BRANDING,
  );
  return { branding: value, save, loading };
}
