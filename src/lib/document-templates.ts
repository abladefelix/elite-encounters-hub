/**
 * Invoice & receipt templates.
 *
 * A template is just the presentation layer around a `documents` row: the
 * business identity, headings, accent colour and the notes printed at the
 * bottom. Admins can edit any template, duplicate one, add their own and pick
 * which is used everywhere — all stored in the shared platform settings row so
 * every member sees the same paperwork.
 */
import { useCallback, useMemo } from "react";

import { useSettingsSection } from "./platform-settings";

export interface DocumentTemplate {
  id: string;
  name: string;
  /** Trading name printed at the top. */
  businessName: string;
  tagline: string;
  /** Free-text address / contact block, one line per row. */
  contact: string;
  invoiceHeading: string;
  receiptHeading: string;
  /** Short line under the totals — payment terms, thanks, etc. */
  thankYouNote: string;
  /** Small print at the very bottom (tax id, policy, bank details). */
  footerNote: string;
  /** Accent colour used for the heading rule and totals row. */
  accent: string;
  showLogo: boolean;
  /** Built-ins cannot be deleted, only edited. */
  builtIn: boolean;
}

export interface DocumentSettings {
  activeTemplateId: string;
  templates: DocumentTemplate[];
}

export const DEFAULT_DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: "classic",
    name: "Classic brass",
    businessName: "Ashnight",
    tagline: "Members-only ash & cleaning services",
    contact: "Accra, Ghana\nbilling@ashnight.app",
    invoiceHeading: "Invoice",
    receiptHeading: "Receipt",
    thankYouNote: "Payable through Paystack. Funds are held in escrow until the job clears.",
    footerNote: "Ashnight · All amounts in Ghana Cedis (GHS).",
    accent: "#b58038",
    showLogo: true,
    builtIn: true,
  },
  {
    id: "minimal",
    name: "Minimal mono",
    businessName: "Ashnight",
    tagline: "",
    contact: "billing@ashnight.app",
    invoiceHeading: "Invoice",
    receiptHeading: "Payment received",
    thankYouNote: "Thank you.",
    footerNote: "",
    accent: "#171514",
    showLogo: false,
    builtIn: true,
  },
  {
    id: "detailed",
    name: "Detailed statement",
    businessName: "Ashnight Services Ltd",
    tagline: "Vetted specialists · Escrow-protected bookings",
    contact: "Ashnight Services Ltd\nAccra, Ghana\n+233 00 000 0000\nbilling@ashnight.app",
    invoiceHeading: "Tax invoice",
    receiptHeading: "Official receipt",
    thankYouNote:
      "Please settle within 7 days. Escrow releases to the specialist after the hold window with no dispute raised.",
    footerNote:
      "Ashnight Services Ltd · TIN: —— · This document is computer generated and valid without signature.",
    accent: "#1f4f4a",
    showLogo: true,
    builtIn: true,
  },
];

export const DEFAULT_DOCUMENT_SETTINGS: DocumentSettings = {
  activeTemplateId: "classic",
  templates: DEFAULT_DOCUMENT_TEMPLATES,
};

export function blankTemplate(name: string): DocumentTemplate {
  return {
    id: `tpl-${Date.now().toString(36)}`,
    name: name.trim() || "New template",
    businessName: "Ashnight",
    tagline: "",
    contact: "",
    invoiceHeading: "Invoice",
    receiptHeading: "Receipt",
    thankYouNote: "",
    footerNote: "",
    accent: "#b58038",
    showLogo: true,
    builtIn: false,
  };
}

export function useDocumentTemplates() {
  const { value, save, loading } = useSettingsSection<DocumentSettings>(
    "documents",
    DEFAULT_DOCUMENT_SETTINGS,
  );

  const templates = value.templates?.length ? value.templates : DEFAULT_DOCUMENT_TEMPLATES;
  const active = useMemo(
    () =>
      templates.find((template) => template.id === value.activeTemplateId) ??
      templates[0] ??
      DEFAULT_DOCUMENT_TEMPLATES[0]!,
    [templates, value.activeTemplateId],
  );

  const setActive = useCallback(
    (id: string) => save({ ...value, templates, activeTemplateId: id }),
    [save, templates, value],
  );

  const upsert = useCallback(
    (template: DocumentTemplate) => {
      const exists = templates.some((row) => row.id === template.id);
      const next = exists
        ? templates.map((row) => (row.id === template.id ? template : row))
        : [...templates, template];
      return save({ ...value, templates: next, activeTemplateId: value.activeTemplateId });
    },
    [save, templates, value],
  );

  const remove = useCallback(
    (id: string) => {
      const next = templates.filter((row) => row.id !== id);
      const fallback = next[0]?.id ?? DEFAULT_DOCUMENT_TEMPLATES[0]!.id;
      return save({
        ...value,
        templates: next.length ? next : DEFAULT_DOCUMENT_TEMPLATES,
        activeTemplateId: value.activeTemplateId === id ? fallback : value.activeTemplateId,
      });
    },
    [save, templates, value],
  );

  const resetToDefaults = useCallback(
    () => save({ activeTemplateId: "classic", templates: DEFAULT_DOCUMENT_TEMPLATES }),
    [save],
  );

  return { templates, active, activeId: active.id, setActive, upsert, remove, resetToDefaults, loading };
}
