/**
 * Admin-owned sign-up form configuration.
 *
 * Every field on the create-account form — built-in or custom — is declared
 * here and switched on/off per audience (clients, specialists or both) from
 * the control room. Answers to built-in fields land on their profile column;
 * custom answers land in `profiles.extra`.
 */
import { useSettingsSection } from "@/lib/platform-settings";

export type SignupAudience = "client" | "specialist" | "both";

export type SignupFieldType =
  | "text"
  | "textarea"
  | "tel"
  | "number"
  | "select"
  | "checkbox"
  | "date";

/** Built-in fields map onto a real profile column. */
export type BuiltinFieldKey =
  | "username"
  | "displayName"
  | "phone"
  | "avatar"
  | "address"
  | "locality"
  | "city"
  | "headline"
  | "bio"
  | "yearsExperience"
  | "languages"
  | "hourlyRate"
  | "ghanaCard"
  | "ghanaCardExpiry";

export interface BuiltinFieldMeta {
  key: BuiltinFieldKey;
  label: string;
  hint: string;
  type: SignupFieldType | "avatar";
  placeholder?: string;
}

export const BUILTIN_FIELDS: BuiltinFieldMeta[] = [
  {
    key: "username",
    label: "Username",
    hint: "Public handle. Unique across Ashnight.",
    type: "text",
    placeholder: "ashfan_kojo",
  },
  {
    key: "displayName",
    label: "Full name",
    hint: "Legal or full name used for vetting.",
    type: "text",
    placeholder: "Ama Mensah",
  },
  { key: "phone", label: "Phone number", hint: "Used for booking alerts.", type: "tel", placeholder: "+233 20 000 0000" },
  { key: "avatar", label: "Profile photo", hint: "Avatar picked at sign-up.", type: "avatar" },
  {
    key: "address",
    label: "Address",
    hint: "Street address for visits and verification.",
    type: "textarea",
    placeholder: "12 Ring Road East, Osu",
  },
  { key: "locality", label: "Locality / area", hint: "Neighbourhood or district served.", type: "text", placeholder: "Osu" },
  { key: "city", label: "City", hint: "City the member is based in.", type: "text", placeholder: "Accra" },
  { key: "headline", label: "Headline", hint: "One-line professional summary.", type: "text", placeholder: "Deep-ash specialist" },
  { key: "bio", label: "About", hint: "Longer introduction.", type: "textarea" },
  { key: "yearsExperience", label: "Years of experience", hint: "Whole number of years.", type: "number" },
  { key: "languages", label: "Languages", hint: "Comma separated.", type: "text", placeholder: "English, Twi" },
  { key: "hourlyRate", label: "Hourly rate (GHS)", hint: "Starting rate, editable later.", type: "number" },
  {
    key: "ghanaCard",
    label: "Ghana Card number",
    hint: "Ghana Card (National ID) number. Checked during vetting and unique across Ashnight.",
    type: "text",
    placeholder: "GHA-123456789-0",
  },
  {
    key: "ghanaCardExpiry",
    label: "Ghana Card expiry",
    hint: "Expiry date printed on the card.",
    type: "date",
  },
];

export interface SignupFieldConfig {
  enabled: boolean;
  required: boolean;
  audience: SignupAudience;
  /** Optional admin override for the visible label. */
  label?: string;
}

export interface CustomSignupField {
  id: string;
  label: string;
  hint: string;
  type: SignupFieldType;
  options: string[];
  enabled: boolean;
  required: boolean;
  audience: SignupAudience;
}

export interface LegalConfig {
  termsTitle: string;
  termsBody: string;
  termsUrl: string;
  privacyTitle: string;
  privacyBody: string;
  privacyUrl: string;
  requireTerms: boolean;
  requirePrivacy: boolean;
  marketingOptIn: boolean;
}

export interface SignupConfig {
  /** Let the visitor pick client vs specialist on the form. */
  roleChoice: boolean;
  clientIntro: string;
  specialistIntro: string;
  fields: Record<BuiltinFieldKey, SignupFieldConfig>;
  custom: CustomSignupField[];
  legal: LegalConfig;
}

function field(
  enabled: boolean,
  required: boolean,
  audience: SignupAudience,
): SignupFieldConfig {
  return { enabled, required, audience };
}

export const DEFAULT_SIGNUP_CONFIG: SignupConfig = {
  roleChoice: true,
  clientIntro: "Create your member account. Vetting happens after sign-up.",
  specialistIntro: "Specialists share full details up front so vetting can start immediately.",
  fields: {
    username: field(true, true, "client"),
    displayName: field(true, true, "specialist"),
    phone: field(true, true, "both"),
    avatar: field(true, false, "both"),
    address: field(true, true, "both"),
    locality: field(true, true, "specialist"),
    city: field(true, true, "specialist"),
    headline: field(true, false, "specialist"),
    bio: field(true, true, "specialist"),
    yearsExperience: field(true, true, "specialist"),
    languages: field(true, false, "specialist"),
    hourlyRate: field(false, false, "specialist"),
    ghanaCard: field(true, true, "both"),
    ghanaCardExpiry: field(true, false, "specialist"),
  },
  custom: [],
  legal: {
    termsTitle: "Terms of service",
    termsBody:
      "Ashnight is a members-only marketplace for vetted ash services. All bookings and payments stay on the platform, funds are held in escrow until a visit is complete, and sharing contact details outside chat may end your membership.",
    termsUrl: "",
    privacyTitle: "Privacy policy",
    privacyBody:
      "We collect only the details needed to vet members, match bookings and settle payments. Your address and phone number are shared with a specialist only after a booking is confirmed. You can request deletion of your account at any time.",
    privacyUrl: "",
    requireTerms: true,
    requirePrivacy: true,
    marketingOptIn: false,
  },
};

export function useSignupConfig() {
  const { value, save, loading } = useSettingsSection<SignupConfig>(
    "signup",
    DEFAULT_SIGNUP_CONFIG,
  );
  // Merge field defaults so a newly shipped built-in field still has config.
  const fields = { ...DEFAULT_SIGNUP_CONFIG.fields, ...(value.fields ?? {}) };
  const legal = { ...DEFAULT_SIGNUP_CONFIG.legal, ...(value.legal ?? {}) };
  return {
    config: { ...value, fields, legal, custom: value.custom ?? [] } as SignupConfig,
    save,
    loading,
  };
}

/** Does this field apply to the role being created? */
export function appliesTo(audience: SignupAudience, role: "client" | "specialist") {
  return audience === "both" || audience === role;
}
