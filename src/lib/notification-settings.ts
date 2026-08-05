import { useSettingsSection } from "@/lib/platform-settings";

export type NotificationChannel = "inApp" | "email" | "sms";
export type NotificationEvent =
  | "welcome"
  | "vettingApproved"
  | "vettingRejected"
  | "bookingRequested"
  | "bookingPaid"
  | "bookingCompleted"
  | "escrowReleased"
  | "escrowDisputed"
  | "payoutUpdated"
  | "complaintUpdated"
  | "membershipExpiring"
  | "membershipExpired"
  | "securityAlert";

export interface NotificationRule {
  inApp: boolean;
  email: boolean;
  sms: boolean;
}

export interface NotificationSettings {
  smsSender: string;
  rules: Record<NotificationEvent, NotificationRule>;
}

const appOnly = (): NotificationRule => ({ inApp: true, email: false, sms: false });
const important = (): NotificationRule => ({ inApp: true, email: true, sms: false });

export const NOTIFICATION_EVENTS: Array<{ key: NotificationEvent; label: string; description: string }> = [
  { key: "welcome", label: "Welcome", description: "Account onboarding or approval greeting." },
  { key: "vettingApproved", label: "Vetting approved", description: "Application has been approved." },
  { key: "vettingRejected", label: "Vetting rejected", description: "Application has been declined." },
  { key: "bookingRequested", label: "Booking requested", description: "A new service request needs attention." },
  { key: "bookingPaid", label: "Booking paid", description: "Payment is confirmed and work can begin." },
  { key: "bookingCompleted", label: "Booking completed", description: "The service has been marked complete." },
  { key: "escrowReleased", label: "Escrow released", description: "Funds have been released to the specialist." },
  { key: "escrowDisputed", label: "Escrow disputed", description: "A payment dispute requires attention." },
  { key: "payoutUpdated", label: "Payout update", description: "A payout request changes status." },
  { key: "complaintUpdated", label: "Complaint update", description: "A complaint receives an admin decision." },
  { key: "membershipExpiring", label: "Membership expiring", description: "Renewal reminder before room access ends." },
  { key: "membershipExpired", label: "Membership expired", description: "Room access has ended." },
  { key: "securityAlert", label: "Security alert", description: "Password, session, or account access warning." },
];

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  smsSender: "Ashnight",
  rules: {
    welcome: important(),
    vettingApproved: important(),
    vettingRejected: important(),
    bookingRequested: appOnly(),
    bookingPaid: important(),
    bookingCompleted: appOnly(),
    escrowReleased: important(),
    escrowDisputed: important(),
    payoutUpdated: important(),
    complaintUpdated: important(),
    membershipExpiring: important(),
    membershipExpired: important(),
    securityAlert: important(),
  },
};

export function useNotificationSettings() {
  return useSettingsSection<NotificationSettings>("notifications", DEFAULT_NOTIFICATION_SETTINGS);
}