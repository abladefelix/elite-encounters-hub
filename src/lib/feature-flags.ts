/**
 * Feature flags.
 *
 * Everything Ashnight can turn on, off or tune without a deploy. Flags live in
 * the admin-owned settings row, so a toggle applies to every member instantly.
 * Add a flag to the catalogue below and it appears in the control room.
 */
import { useSettingsSection } from "@/lib/platform-settings";

export type FeatureFlagKey =
  | "maintenanceMode"
  | "signupsOpen"
  | "specialistApplications"
  | "publicSpecialistDirectory"
  | "callsEnabled"
  | "giftsEnabled"
  | "bookingsEnabled"
  | "attachmentsEnabled"
  | "chatImageSharing"
  | "chatLocationSharing"
  | "googleSignIn"
  | "specialistPortfolioUploads"
  | "ratingsEnabled"
  | "reportsEnabled"
  | "twoFactorAvailable"
  | "requireTwoFactorForAdmins"
  | "requireTwoFactorForSpecialists"
  | "autoReleaseEscrow"
  | "instantPayouts"
  | "referralProgram"
  | "loyaltyCredits"
  | "recurringBookings"
  | "specialistCalendar"
  | "aiScopeAssistant"
  | "pushNotifications"
  | "emailNotifications"
  | "smsNotifications"
  | "inAppSupportChat"
  | "auditLogging";

export interface FeatureFlagMeta {
  key: FeatureFlagKey;
  label: string;
  hint: string;
  group: "Access" | "Chat & calls" | "Money" | "Growth" | "Security" | "Notifications";
  /** Not wired to a member-facing surface yet — safe to stage ahead of time. */
  planned?: boolean;
}

export const FEATURE_FLAGS: FeatureFlagMeta[] = [
  {
    key: "maintenanceMode",
    label: "Maintenance mode",
    hint: "Shows a maintenance notice across the member app. Admin stays reachable.",
    group: "Access",
  },
  {
    key: "signupsOpen",
    label: "Open sign-ups",
    hint: "Allow new accounts to be created. Vetting still applies.",
    group: "Access",
  },
  {
    key: "specialistApplications",
    label: "Specialist applications",
    hint: "Accept new specialist applications from /apply.",
    group: "Access",
  },
  {
    key: "publicSpecialistDirectory",
    label: "Public specialist directory",
    hint: "Let signed-out visitors browse specialists.",
    group: "Access",
  },
  {
    key: "callsEnabled",
    label: "Voice & video calls",
    hint: "Master switch. Per-room call rules still apply underneath.",
    group: "Chat & calls",
  },
  {
    key: "attachmentsEnabled",
    label: "Chat attachments",
    hint: "Master switch for photo and file sharing in threads.",
    group: "Chat & calls",
  },
  {
    key: "chatImageSharing",
    label: "Chat image sharing",
    hint: "Photos in one-to-one threads. Per-room photo privileges still apply underneath.",
    group: "Chat & calls",
  },
  {
    key: "chatLocationSharing",
    label: "Share location in chat",
    hint: "Lets members send their current location so a specialist can find the address.",
    group: "Chat & calls",
  },
  {
    key: "googleSignIn",
    label: "Continue with Google",
    hint: "Show the Google button on sign in and sign up. Hidden by default.",
    group: "Access",
  },
  {
    key: "specialistPortfolioUploads",
    label: "Specialist portfolio uploads",
    hint: "Let specialists attach work photos and one intro video while signing up.",
    group: "Access",
  },
  {
    key: "giftsEnabled",
    label: "Cash gifts",
    hint: "Master switch for in-chat gifts with real cash value.",
    group: "Money",
  },
  {
    key: "bookingsEnabled",
    label: "Booking requests",
    hint: "Allow clients to request and pay for a visit in chat.",
    group: "Money",
  },
  {
    key: "ratingsEnabled",
    label: "Star ratings",
    hint: "Let members rate each other after a visit.",
    group: "Chat & calls",
  },
  {
    key: "reportsEnabled",
    label: "Member reporting",
    hint: "Report button in chat feeding the trust & safety queue.",
    group: "Security",
  },
  {
    key: "twoFactorAvailable",
    label: "Optional 2FA",
    hint: "Let any member add an authenticator app to their account.",
    group: "Security",
  },
  {
    key: "requireTwoFactorForAdmins",
    label: "Require 2FA for admins",
    hint: "Admins must complete 2FA enrolment before using the control room.",
    group: "Security",
  },
  {
    key: "requireTwoFactorForSpecialists",
    label: "Require 2FA for specialists",
    hint: "Specialists must enrol before they can take paid work.",
    group: "Security",
    planned: true,
  },
  {
    key: "autoReleaseEscrow",
    label: "Automatic escrow release",
    hint: "Release held funds once the hold window elapses with no dispute.",
    group: "Money",
  },
  {
    key: "instantPayouts",
    label: "Instant payouts",
    hint: "Bypass the hold window entirely. Off by default for a reason.",
    group: "Money",
  },
  {
    key: "referralProgram",
    label: "Referral programme",
    hint: "Reward members who bring vetted clients or specialists.",
    group: "Growth",
    planned: true,
  },
  {
    key: "loyaltyCredits",
    label: "Loyalty credits",
    hint: "Credit repeat clients a share of each completed visit.",
    group: "Growth",
    planned: true,
  },
  {
    key: "recurringBookings",
    label: "Recurring visits",
    hint: "Weekly or fortnightly repeats on a single booking.",
    group: "Growth",
    planned: true,
  },
  {
    key: "specialistCalendar",
    label: "Specialist availability calendar",
    hint: "Publish bookable slots instead of free-text scheduling.",
    group: "Growth",
    planned: true,
  },
  {
    key: "aiScopeAssistant",
    label: "AI scoping assistant",
    hint: "Suggests hours and add-ons from the chat conversation.",
    group: "Growth",
    planned: true,
  },
  {
    key: "pushNotifications",
    label: "Push notifications",
    hint: "Browser push for new messages and booking updates.",
    group: "Notifications",
    planned: true,
  },
  {
    key: "emailNotifications",
    label: "Email notifications",
    hint: "Transactional email for bookings, escrow and vetting.",
    group: "Notifications",
    planned: true,
  },
  {
    key: "smsNotifications",
    label: "SMS notifications",
    hint: "Text alerts for visit reminders.",
    group: "Notifications",
    planned: true,
  },
  {
    key: "inAppSupportChat",
    label: "In-app support chat",
    hint: "Direct line to Ashnight support from any screen.",
    group: "Notifications",
    planned: true,
  },
  {
    key: "auditLogging",
    label: "Admin audit logging",
    hint: "Record every admin change with who made it and when.",
    group: "Security",
  },
];

export type FeatureFlags = Record<FeatureFlagKey, boolean>;

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  maintenanceMode: false,
  signupsOpen: true,
  specialistApplications: true,
  publicSpecialistDirectory: true,
  callsEnabled: true,
  giftsEnabled: true,
  bookingsEnabled: true,
  attachmentsEnabled: true,
  chatImageSharing: true,
  chatLocationSharing: true,
  googleSignIn: false,
  specialistPortfolioUploads: true,
  ratingsEnabled: true,
  reportsEnabled: true,
  twoFactorAvailable: true,
  requireTwoFactorForAdmins: false,
  requireTwoFactorForSpecialists: false,
  autoReleaseEscrow: true,
  instantPayouts: false,
  referralProgram: false,
  loyaltyCredits: false,
  recurringBookings: false,
  specialistCalendar: false,
  aiScopeAssistant: false,
  pushNotifications: false,
  emailNotifications: false,
  smsNotifications: false,
  inAppSupportChat: false,
  auditLogging: true,
};

export const FLAG_GROUPS = [
  "Access",
  "Chat & calls",
  "Money",
  "Security",
  "Growth",
  "Notifications",
] as const;

/** Reads flags anywhere in the app; `flags` is always fully populated. */
export function useFeatureFlags() {
  const { value, save, loading } = useSettingsSection<FeatureFlags>(
    "features",
    DEFAULT_FEATURE_FLAGS,
  );

  return {
    flags: value,
    loading,
    on: (key: FeatureFlagKey) => value[key],
    setFlag: async (key: FeatureFlagKey, enabled: boolean) =>
      save({ ...value, [key]: enabled }),
    setMany: async (patch: Partial<FeatureFlags>) => save({ ...value, ...patch }),
    reset: async () => save({ ...DEFAULT_FEATURE_FLAGS }),
  };
}
