/**
 * Admin-owned email configuration.
 *
 * Ashnight ships with email verification switched OFF so members can sign up
 * and use the platform immediately. When the sending domain is ready, an admin
 * turns verification back on from Control room → Email & domain — no code
 * change and no redeploy.
 *
 * The sender fields are stored here so the DNS checklist the control room shows
 * always matches the domain the admin actually intends to send from.
 */
import { useSettingsSection } from "@/lib/platform-settings";

export interface EmailSettings {
  /** When on, an unverified address cannot sign in. Off by default. */
  requireVerification: boolean;
  /** Domain (or subdomain) Ashnight sends from, e.g. notify.ashnight.com. */
  senderDomain: string;
  /** Friendly name recipients see. */
  senderName: string;
  /** Mailbox part of the from address, e.g. "no-reply". */
  senderMailbox: string;
  /** Where replies should land. */
  replyTo: string;
  /** platform = built-in sender, smtp = the SMTP credentials in the vault. */
  transport: "platform" | "smtp";
  /** Automated member emails. */
  welcomeEmail: boolean;
  receiptEmail: boolean;
  complaintEmail: boolean;
  /** Hours an unverified sign-up keeps its username/email/phone reserved. */
  reclaimAfterHours: number;
}

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  requireVerification: false,
  senderDomain: "",
  senderName: "Ashnight",
  senderMailbox: "no-reply",
  replyTo: "",
  transport: "platform",
  welcomeEmail: true,
  receiptEmail: true,
  complaintEmail: true,
  reclaimAfterHours: 48,
};

export function useEmailSettings() {
  const { value, save, loading } = useSettingsSection<EmailSettings>(
    "email",
    DEFAULT_EMAIL_SETTINGS,
  );
  return { settings: value, save, loading };
}

export function fromAddress(settings: EmailSettings) {
  if (!settings.senderDomain) return "";
  const mailbox = settings.senderMailbox.trim() || "no-reply";
  return `${mailbox}@${settings.senderDomain.trim()}`;
}

export interface DnsRecord {
  type: string;
  name: string;
  value: string;
  note: string;
}

/**
 * The records a sending domain needs. Values are the standard shapes; the exact
 * DKIM selector comes from whichever provider the admin points the domain at.
 */
export function dnsChecklist(settings: EmailSettings): DnsRecord[] {
  const domain = settings.senderDomain.trim() || "notify.example.com";
  const root = domain.split(".").slice(-2).join(".");
  return [
    {
      type: "TXT",
      name: domain,
      value: "v=spf1 include:<your-mail-provider> ~all",
      note: "SPF — authorises the servers allowed to send as this domain.",
    },
    {
      type: "CNAME",
      name: `ashnight._domainkey.${domain}`,
      value: "<dkim-target-from-provider>",
      note: "DKIM — signs every message so inboxes can verify it.",
    },
    {
      type: "TXT",
      name: `_dmarc.${root}`,
      value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${root}`,
      note: "DMARC — tells inboxes what to do with spoofed mail.",
    },
    {
      type: "MX",
      name: domain,
      value: "10 <inbound-host-from-provider>",
      note: "Only needed if this domain also receives replies or bounces.",
    },
  ];
}
