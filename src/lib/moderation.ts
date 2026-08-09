import { useCallback, useEffect, useState } from "react";

import type { RoomMap, Tier } from "./types";

/**
 * Chat moderation.
 *
 * Two admin-owned controls live here:
 *  1. a flagged-word list — words that are masked, warned on, or blocked;
 *  2. contact-detail blocking — phone numbers, emails, links and social
 *     handles, so deals stay on-platform and inside escrow.
 *
 * Detection is pure and testable; the settings themselves live in the admin
 * room-settings store, and every hit can be written to a review log the admin
 * dashboard reads.
 */

/* ------------------------------------------------------------------ settings */

/** What the platform does when a rule matches. */
export type ModerationAction = "warn" | "mask" | "block";

export const MODERATION_ACTIONS: { id: ModerationAction; label: string; hint: string }[] = [
  { id: "warn", label: "Warn only", hint: "Message is delivered; the member sees a warning." },
  { id: "mask", label: "Mask it", hint: "Delivered with the offending text redacted." },
  { id: "block", label: "Block send", hint: "Message never leaves the composer." },
];

export interface ModerationSettings {
  /** Master switch for all chat moderation. */
  enabled: boolean;
  /**
   * Phone numbers get their own switch, because they are the single most
   * common way a deal walks off-platform. On by default and set to "block".
   */
  blockPhoneNumbers: boolean;
  phoneAction: ModerationAction;
  /** Detect and act on emails, links and social handles. */
  blockContactSharing: boolean;
  contactAction: ModerationAction;
  /**
   * Run shared photos through a vision scan, so a business card, a WhatsApp
   * screenshot or a scribbled momo number is caught the same way typed text is.
   */
  scanImages: boolean;
  imageAction: ModerationAction;
  /** Act on the flagged-word list below. */
  flaggedWordsEnabled: boolean;
  flaggedWordsAction: ModerationAction;
  flaggedWords: string[];
  /** Post a system note in the thread explaining what happened. */
  notifyMember: boolean;
  /** Write every hit to the admin review log. */
  logHits: boolean;
  /** Rooms allowed to exchange contact details anyway. */
  contactExemptRooms: RoomMap<boolean>;
}

export const DEFAULT_FLAGGED_WORDS = [
  "cash only",
  "off platform",
  "offsite payment",
  "bank transfer",
  "momo number",
  "meet outside",
  "escort",
  "sugar",
];

export const DEFAULT_MODERATION_SETTINGS: ModerationSettings = {
  enabled: true,
  blockPhoneNumbers: true,
  phoneAction: "block",
  blockContactSharing: true,
  contactAction: "mask",
  scanImages: true,
  imageAction: "block",
  flaggedWordsEnabled: true,
  flaggedWordsAction: "warn",
  flaggedWords: DEFAULT_FLAGGED_WORDS,
  notifyMember: true,
  logHits: true,
  contactExemptRooms: { basic: false, premium: false, ultimate: false },
};

/* ----------------------------------------------------------------- detection */

export type FindingKind = "phone" | "email" | "link" | "handle" | "word" | "image";

export interface Finding {
  kind: FindingKind;
  match: string;
  start: number;
  end: number;
}

export const FINDING_LABEL: Record<FindingKind, string> = {
  phone: "Phone number",
  email: "Email address",
  link: "External link",
  handle: "Social handle",
  word: "Flagged word",
  image: "Image content",
};

const EMAIL = /[\w.+-]+\s?(?:@|\(at\)|\[at\]|\sat\s)\s?[\w-]+(?:\.[\w-]{2,})+/gi;
const LINK =
  /\b(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:com|net|org|io|app|gh|co|me)\b(?:\/\S*)?/gi;
const HANDLE = /(?:^|\s)@[A-Za-z0-9._]{3,}/g;
/** 7+ digits, tolerating spaces, dashes, dots, brackets and a leading +. */
const PHONE = /(?:\+?\d[\d\s().-]{5,}\d)/g;
/** Digits spelled out, a common way around the digit rule. */
const SPELLED =
  /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|oh|nought)\b(?:[\s,-]+\b(?:zero|one|two|three|four|five|six|seven|eight|nine|oh|nought)\b){4,}/gi;
const MESSENGER =
  /\b(?:whats\s?app|whatsapp|telegram|snapchat|snap\s?chat|imo|signal number|viber|instagram|insta|ig)\b\s*(?:me|number|no|handle|id)?\s*[:=-]?\s*(?:\+?\d|@[\w.]+)/gi;

function collect(text: string, pattern: RegExp, kind: FindingKind, out: Finding[]) {
  const regex = new RegExp(pattern.source, pattern.flags);
  let hit: RegExpExecArray | null;
  while ((hit = regex.exec(text)) !== null) {
    const raw = hit[0];
    const trimmed = raw.replace(/^\s+/, "");
    const start = hit.index + (raw.length - trimmed.length);
    // Numeric phone matches need 7+ digits to count; spelled-out digit runs
    // ("zero two four …") carry no digits at all, so they are exempt.
    if (kind === "phone" && /\d/.test(trimmed) && trimmed.replace(/\D/g, "").length < 7) continue;
    out.push({ kind, match: trimmed.trim(), start, end: start + trimmed.trim().length });
    if (regex.lastIndex === hit.index) regex.lastIndex += 1;
  }
}

/**
 * Phone numbers only — digits, spelled-out digits, and "WhatsApp me 024…"
 * style messenger handoffs. Kept separate so admins can govern phone numbers
 * independently of emails and links.
 */
export function detectPhones(text: string): Finding[] {
  const out: Finding[] = [];
  collect(text, MESSENGER, "phone", out);
  collect(text, PHONE, "phone", out);
  collect(text, SPELLED, "phone", out);
  return dedupe(out);
}

/**
 * Contact details a member tried to exchange. Phone numbers are included by
 * default; pass `{ includePhones: false }` when they are handled separately.
 */
export function detectContact(
  text: string,
  options: { includePhones?: boolean } = {},
): Finding[] {
  const out: Finding[] = [];
  collect(text, EMAIL, "email", out);
  collect(text, LINK, "link", out);
  collect(text, HANDLE, "handle", out);
  if (options.includePhones !== false) out.push(...detectPhones(text));
  return dedupe(out);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lookbehind is unsupported on iOS WebViews older than 16.4. */
const SUPPORTS_LOOKBEHIND = (() => {
  try {
    // eslint-disable-next-line prefer-regex-literals
    new RegExp("(?<!a)b");
    return true;
  } catch {
    return false;
  }
})();

/** Words or phrases from the admin list. Case-insensitive, whole-phrase. */
export function detectFlaggedWords(text: string, words: string[]): Finding[] {
  const out: Finding[] = [];
  for (const word of words) {
    const term = word.trim();
    if (term.length < 2) continue;
    const escaped = escapeRegExp(term);
    const pattern = SUPPORTS_LOOKBEHIND
      ? new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`, "giu")
      : new RegExp(`\\b${escaped}\\b`, "gi");
    collect(text, pattern, "word", out);
  }
  return dedupe(out);
}


function dedupe(findings: Finding[]): Finding[] {
  const sorted = [...findings].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Finding[] = [];
  for (const finding of sorted) {
    const overlaps = out.some((kept) => finding.start < kept.end && finding.end > kept.start);
    if (!overlaps) out.push(finding);
  }
  return out;
}

/** Replace every finding with a block of dots of similar length. */
export function maskFindings(text: string, findings: Finding[]): string {
  let out = "";
  let cursor = 0;
  for (const finding of [...findings].sort((a, b) => a.start - b.start)) {
    if (finding.start < cursor) continue;
    out += text.slice(cursor, finding.start);
    out += "•".repeat(Math.min(12, Math.max(3, finding.match.length)));
    cursor = finding.end;
  }
  return out + text.slice(cursor);
}

/* ----------------------------------------------------------------- decision */

export interface ModerationVerdict {
  /** What the composer should do with the message. */
  action: "allow" | "mask" | "block";
  /** Body to actually send (masked when action is "mask"). */
  body: string;
  /** Phone-number hits, governed by their own admin switch. */
  phones: Finding[];
  /** Email, link and social-handle hits. */
  contact: Finding[];
  words: Finding[];
  findings: Finding[];
  reason: string | null;
}

const RANK: Record<"allow" | "mask" | "block", number> = { allow: 0, mask: 1, block: 2 };

/** Run the admin rules over one outgoing message for a given room. */
export function moderateMessage(
  body: string,
  settings: ModerationSettings,
  room: Tier,
): ModerationVerdict {
  const clean: ModerationVerdict = {
    action: "allow",
    body,
    phones: [],
    contact: [],
    words: [],
    findings: [],
    reason: null,
  };
  if (!settings.enabled) return clean;

  const exempt = settings.contactExemptRooms[room] ?? false;
  const phoneOn = settings.blockPhoneNumbers && !exempt;
  const contactOn = settings.blockContactSharing && !exempt;
  const phones = phoneOn ? detectPhones(body) : [];
  const contact = contactOn ? detectContact(body, { includePhones: false }) : [];
  const words = settings.flaggedWordsEnabled
    ? detectFlaggedWords(body, settings.flaggedWords)
    : [];

  if (!phones.length && !contact.length && !words.length) return clean;

  const actions: ModerationAction[] = [];
  if (phones.length) actions.push(settings.phoneAction);
  if (contact.length) actions.push(settings.contactAction);
  if (words.length) actions.push(settings.flaggedWordsAction);
  const action = actions.reduce<"allow" | "mask" | "block">((worst, current) => {
    const mapped = current === "warn" ? "allow" : current;
    return RANK[mapped] > RANK[worst] ? mapped : worst;
  }, "allow");

  const findings = dedupe([...phones, ...contact, ...words]);
  const reasons: string[] = [];
  if (phones.length) {
    reasons.push(phones.length > 1 ? "phone numbers" : "a phone number");
  }
  if (contact.length) {
    reasons.push(
      `contact details (${[...new Set(contact.map((f) => FINDING_LABEL[f.kind].toLowerCase()))].join(", ")})`,
    );
  }
  if (words.length) {
    reasons.push(`flagged wording (${words.map((f) => `“${f.match}”`).join(", ")})`);
  }

  return {
    action,
    body: action === "mask" ? maskFindings(body, findings) : body,
    phones,
    contact,
    words,
    findings,
    reason: reasons.join(" and "),
  };
}

/* --------------------------------------------------------------- review log */

export interface ModerationHit {
  id: string;
  at: string;
  threadId: string;
  threadLabel: string;
  room: Tier;
  authorId: string;
  excerpt: string;
  kinds: FindingKind[];
  matches: string[];
  action: "allow" | "mask" | "block";
  reviewed: boolean;
}

const LOG_KEY = "ashnight-moderation-log";
const LOG_EVENT = "ashnight-moderation-log-change";
const MAX_HITS = 200;

function readLog(): ModerationHit[] {
  try {
    const raw = window.localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ModerationHit[]) : [];
  } catch {
    return [];
  }
}

function writeLog(hits: ModerationHit[]) {
  try {
    window.localStorage.setItem(LOG_KEY, JSON.stringify(hits.slice(0, MAX_HITS)));
    window.dispatchEvent(new CustomEvent(LOG_EVENT));
  } catch {
    /* storage unavailable */
  }
}

/** Record one moderation hit for admin review. */
export function logModerationHit(
  input: Omit<ModerationHit, "id" | "at" | "reviewed">,
): ModerationHit {
  const hit: ModerationHit = {
    ...input,
    id: `mod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    reviewed: false,
  };
  writeLog([hit, ...readLog()]);
  return hit;
}

/** Live view of the moderation log, for the admin dashboard. */
export function useModerationLog() {
  const [hits, setHits] = useState<ModerationHit[]>([]);

  useEffect(() => {
    const sync = () => setHits(readLog());
    sync();
    window.addEventListener(LOG_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(LOG_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const markReviewed = useCallback((id: string, reviewed = true) => {
    writeLog(readLog().map((hit) => (hit.id === id ? { ...hit, reviewed } : hit)));
  }, []);

  const remove = useCallback((id: string) => {
    writeLog(readLog().filter((hit) => hit.id !== id));
  }, []);

  const clear = useCallback(() => writeLog([]), []);

  return { hits, markReviewed, remove, clear };
}
