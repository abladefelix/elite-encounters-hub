/**
 * Admin-owned configuration for every member-facing form outside sign-up.
 *
 * Sign-up already has its own builder (`signup-fields.ts`). This module covers
 * the sign-in screen, the profile editor, the application form and the support
 * complaint form: which fields appear, whether they are required, their visible
 * label / hint / placeholder, and any extra questions the admin adds.
 *
 * Built-in fields are declared in `FORM_REGISTRY` so the control room can list
 * them without hardcoding copy in the admin UI. Custom answers are appended to
 * the record the form already writes (profile extras, application pitch,
 * complaint body), so nothing here needs a schema change.
 */
import { useMemo } from "react";

import { useSettingsSection } from "@/lib/platform-settings";
import type { SignupFieldType } from "@/lib/signup-fields";

export type FormKey = "signin" | "profile" | "apply" | "complaint";

export interface FieldOverride {
  enabled: boolean;
  required: boolean;
  label?: string;
  hint?: string;
  placeholder?: string;
}

export interface CustomFormField {
  id: string;
  label: string;
  hint: string;
  type: SignupFieldType;
  options: string[];
  enabled: boolean;
  required: boolean;
  /** Optional gate: the answer must match this value exactly (sign-in codes). */
  mustEqual?: string;
}

export interface FormSectionConfig {
  /** Copy shown above the form. Empty hides the note. */
  intro: string;
  submitLabel?: string;
  fields: Record<string, FieldOverride>;
  custom: CustomFormField[];
}

export type IdentifierMode = "either" | "email" | "username";

export interface SigninConfig extends FormSectionConfig {
  identifierMode: IdentifierMode;
  showGoogle: boolean;
  showForgot: boolean;
  showSignupTab: boolean;
  signinTabLabel: string;
  signupTabLabel: string;
}

export interface FormsConfig {
  signin: SigninConfig;
  profile: FormSectionConfig;
  apply: FormSectionConfig;
  complaint: FormSectionConfig;
}

export interface BuiltinFormField {
  key: string;
  label: string;
  hint: string;
  /** Fields the app cannot run without stay switched on. */
  locked?: boolean;
}

export interface FormMeta {
  key: FormKey;
  label: string;
  description: string;
  fields: BuiltinFormField[];
}

export const FORM_REGISTRY: FormMeta[] = [
  {
    key: "signin",
    label: "Sign in",
    description: "The form members use to get back into Ashnight.",
    fields: [
      { key: "identifier", label: "Username or email", hint: "Login identifier.", locked: true },
      { key: "password", label: "Password", hint: "Always required.", locked: true },
    ],
  },
  {
    key: "profile",
    label: "Profile editor",
    description: "Details members can edit on their own profile page.",
    fields: [
      { key: "displayName", label: "Full name", hint: "Name shown across the app." },
      { key: "headline", label: "Headline", hint: "One-line summary." },
      { key: "city", label: "City", hint: "City the member is based in." },
      { key: "phone", label: "Phone", hint: "Contact number." },
      { key: "hourlyRate", label: "Hourly rate (GHS)", hint: "Dolls only." },
      { key: "yearsExperience", label: "Years of experience", hint: "Dolls only." },
      { key: "bio", label: "About you", hint: "Longer introduction." },
    ],
  },
  {
    key: "apply",
    label: "Application form",
    description: "The vetting application at /apply.",
    fields: [
      { key: "fullName", label: "Full name", hint: "Legal name for vetting.", locked: true },
      { key: "phone", label: "Phone", hint: "Contact number.", locked: true },
      { key: "city", label: "City", hint: "Where they are based.", locked: true },
      { key: "room", label: "Room preference", hint: "Clients only." },
      { key: "services", label: "Services rendered", hint: "Dolls only." },
      { key: "about", label: "About / experience", hint: "Free-text pitch.", locked: true },
    ],
  },
  {
    key: "complaint",
    label: "Support complaint",
    description: "The complaint form on the inbox & support page.",
    fields: [
      { key: "category", label: "Category", hint: "Complaint type." },
      { key: "subject", label: "Subject", hint: "Short summary.", locked: true },
      { key: "body", label: "What happened?", hint: "Full description.", locked: true },
    ],
  },
];

export const FORM_META = Object.fromEntries(FORM_REGISTRY.map((form) => [form.key, form])) as Record<
  FormKey,
  FormMeta
>;

function defaults(key: FormKey, required: string[] = []): Record<string, FieldOverride> {
  const entries = FORM_META[key].fields.map((field) => [
    field.key,
    { enabled: true, required: field.locked ? true : required.includes(field.key) },
  ]);
  return Object.fromEntries(entries) as Record<string, FieldOverride>;
}

export const DEFAULT_FORMS_CONFIG: FormsConfig = {
  signin: {
    intro: "Create an account or sign in to view and book vetted dolls.",
    submitLabel: "Sign in",
    identifierMode: "either",
    showGoogle: true,
    showForgot: true,
    showSignupTab: true,
    signinTabLabel: "Sign in",
    signupTabLabel: "Create account",
    fields: defaults("signin"),
    custom: [],
  },
  profile: {
    intro: "",
    submitLabel: "Save",
    fields: { ...defaults("profile", ["displayName"]) },
    custom: [],
  },
  apply: {
    intro: "",
    submitLabel: "Submit application",
    fields: defaults("apply"),
    custom: [],
  },
  complaint: {
    intro: "",
    submitLabel: "Send to support",
    fields: defaults("complaint"),
    custom: [],
  },
};

function mergeSection<T extends FormSectionConfig>(fallback: T, stored: Partial<T> | undefined): T {
  return {
    ...fallback,
    ...(stored ?? {}),
    fields: { ...fallback.fields, ...((stored?.fields as object) ?? {}) },
    custom: (stored?.custom as CustomFormField[] | undefined) ?? [],
  };
}

/** Reads (and lets admins save) the whole forms configuration. */
export function useFormsConfig() {
  const { value, save, loading } = useSettingsSection<FormsConfig>("forms", DEFAULT_FORMS_CONFIG);
  const config = useMemo<FormsConfig>(
    () => ({
      signin: mergeSection(DEFAULT_FORMS_CONFIG.signin, value?.signin),
      profile: mergeSection(DEFAULT_FORMS_CONFIG.profile, value?.profile),
      apply: mergeSection(DEFAULT_FORMS_CONFIG.apply, value?.apply),
      complaint: mergeSection(DEFAULT_FORMS_CONFIG.complaint, value?.complaint),
    }),
    [value],
  );
  return { config, save, loading };
}

export interface FormHelper {
  section: FormSectionConfig;
  /** Is this field switched on by the admin? */
  visible: (key: string) => boolean;
  required: (key: string) => boolean;
  label: (key: string, fallback: string) => string;
  hint: (key: string, fallback?: string) => string | undefined;
  placeholder: (key: string, fallback?: string) => string | undefined;
  /** Custom questions that are switched on. */
  custom: CustomFormField[];
  intro: string;
  submitLabel: (fallback: string) => string;
}

function helperFor(section: FormSectionConfig): FormHelper {
  const get = (key: string) => section.fields[key];
  return {
    section,
    visible: (key) => get(key)?.enabled !== false,
    required: (key) => get(key)?.required === true,
    label: (key, fallback) => get(key)?.label?.trim() || fallback,
    hint: (key, fallback) => get(key)?.hint?.trim() || fallback,
    placeholder: (key, fallback) => get(key)?.placeholder?.trim() || fallback,
    custom: (section.custom ?? []).filter((row) => row.enabled),
    intro: section.intro ?? "",
    submitLabel: (fallback) => section.submitLabel?.trim() || fallback,
  };
}

/** Field-level helper for one form. */
export function useFormFields(key: Exclude<FormKey, "signin">): FormHelper {
  const { config } = useFormsConfig();
  return useMemo(() => helperFor(config[key]), [config, key]);
}

/** Sign-in keeps its extra switches, so it has its own hook. */
export function useSigninConfig() {
  const { config } = useFormsConfig();
  return useMemo(
    () => ({ signin: config.signin, helper: helperFor(config.signin) }),
    [config.signin],
  );
}

export function identifierCopy(mode: IdentifierMode) {
  if (mode === "email")
    return {
      label: "Email address",
      placeholder: "you@example.com",
      hint: "Use the email you signed up with.",
    };
  if (mode === "username")
    return {
      label: "Username",
      placeholder: "ashfan_kojo",
      hint: "Your username is unique across Ashnight.",
    };
  return {
    label: "Username or email",
    placeholder: "ashfan_kojo or you@example.com",
    hint: "Either works — your username is unique across Ashnight.",
  };
}

/** Turns custom answers into readable lines appended to a free-text field. */
export function customAnswerLines(
  custom: CustomFormField[],
  values: Record<string, string | boolean>,
) {
  return custom
    .map((row) => {
      const raw = values[row.id];
      const text = typeof raw === "boolean" ? (raw ? "Yes" : "No") : (raw ?? "").toString().trim();
      return text ? `${row.label}: ${text}` : "";
    })
    .filter(Boolean);
}

/** Client-side validation shared by every form that renders custom fields. */
export function validateCustom(
  custom: CustomFormField[],
  values: Record<string, string | boolean>,
): string | null {
  for (const row of custom) {
    const raw = values[row.id];
    const text = typeof raw === "boolean" ? (raw ? "yes" : "") : (raw ?? "").toString().trim();
    if (row.required && !text) return `${row.label} is required.`;
    if (row.mustEqual && text && text.toLowerCase() !== row.mustEqual.trim().toLowerCase())
      return `${row.label} is not correct.`;
    if (row.mustEqual && row.required && !text) return `${row.label} is required.`;
  }
  return null;
}
