/**
 * The welcome message new members receive.
 *
 * Admins write the title and body in the control room; tokens are filled in per
 * recipient. Client and specialist copy are separate so each side gets the right
 * next step.
 */
import { useSettingsSection } from "./platform-settings";

export interface WelcomeAudienceCopy {
  title: string;
  body: string;
  /** In-app destination the notification links to. */
  link: string;
}

export interface WelcomeSettings {
  enabled: boolean;
  client: WelcomeAudienceCopy;
  specialist: WelcomeAudienceCopy;
}

export const DEFAULT_WELCOME_SETTINGS: WelcomeSettings = {
  enabled: true,
  client: {
    title: "Welcome to {{brand}}, {{name}}",
    body:
      "Your account is live. Browse vetted specialists, start a chat, and request a service straight from the conversation — every payment is held in escrow until the job is done.",
    link: "/specialists",
  },
  specialist: {
    title: "Welcome to {{brand}}, {{name}}",
    body:
      "Thanks for applying. Our team reviews every specialist by hand — finish your profile, add your services and portfolio, and we'll be in touch as soon as vetting is complete.",
    link: "/profile",
  },
};

export const WELCOME_TOKENS = [
  { token: "{{name}}", hint: "The member's display name" },
  { token: "{{brand}}", hint: "Your brand name" },
  { token: "{{firstName}}", hint: "First word of the display name" },
] as const;

export function renderWelcomeCopy(
  template: string,
  values: { name: string; brand: string },
): string {
  const firstName = values.name.trim().split(/\s+/)[0] ?? values.name;
  return template
    .replaceAll("{{name}}", values.name)
    .replaceAll("{{firstName}}", firstName)
    .replaceAll("{{brand}}", values.brand);
}

export function useWelcomeSettings() {
  const { value, save, loading } = useSettingsSection<WelcomeSettings>(
    "welcome",
    DEFAULT_WELCOME_SETTINGS,
  );
  return { welcome: value, save, loading };
}
