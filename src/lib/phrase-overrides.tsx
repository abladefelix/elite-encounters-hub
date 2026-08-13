/**
 * Site-wide wording overrides.
 *
 * The keyed dictionary in `locale.ts` covers the platform's core nouns, but an
 * admin also needs to reword copy that lives inside sentences all over the app
 * ("Calling is disabled…", "Escrow hold", marketing paragraphs, button labels
 * that were never keyed). This engine applies admin-defined find/replace rules
 * to rendered text — every page, every screen, web and native shell — so the
 * whole site can speak a different vocabulary without a deploy.
 *
 * It rewrites text nodes plus the user-visible attributes (placeholder, title,
 * aria-label, alt) and re-runs on every DOM mutation, so route changes and
 * lazily rendered dialogs are covered too. Anything inside an element marked
 * `data-no-reword` is left alone — that is how the admin editor itself avoids
 * rewriting the very words being edited.
 *
 * Each rule can be scoped so a word changes in one place but not everywhere:
 * - everywhere: every page and screen
 * - routes: only on listed path patterns (supports `*` wildcards)
 * - exclude-routes: everywhere except listed paths
 * - selectors: only inside listed CSS selectors
 * - exclude-admin: everywhere except the control room
 */
import { useEffect, useMemo } from "react";

import { useLocaleSettings } from "./locale";

export interface PhraseRule {
  id: string;
  /** Text to look for in rendered copy. */
  find: string;
  /** Replacement text. Empty removes the phrase. */
  replace: string;
  /** Match capitalisation exactly. Off also rewrites Title Case / UPPER CASE. */
  matchCase: boolean;
  /** Only match standalone words, so "cat" never hits "category". */
  wholeWord: boolean;
  enabled: boolean;
  /**
   * Where this rule applies.
   * - everywhere: every page and screen
   * - routes: only on the listed paths
   * - exclude-routes: everywhere except the listed paths
   * - selectors: only inside the listed CSS selectors
   * - exclude-admin: everywhere except /ashnight-control/*
   */
  scope: "everywhere" | "routes" | "exclude-routes" | "selectors" | "exclude-admin";
  /** Path patterns when scope is routes/exclude-routes. Supports * wildcards. */
  paths: string[];
  /** CSS selectors when scope is selectors. */
  selectors: string[];
  /** CSS selectors to skip even when a broader rule matches. */
  excludeSelectors: string[];
}

/**
 * Built-in wording the platform always speaks, applied before any admin rule.
 *
 * The people who deliver the work are called "Dolls" everywhere in the product,
 * while the code, database and API keep the older `specialist` naming. Rewriting
 * at render time keeps the two in step without a mass rename. Plural first so
 * "Specialists" never resolves to "Dolls" via the singular rule.
 */
export const BASE_PHRASE_RULES: PhraseRule[] = [
  {
    id: "base-dolls-plural",
    find: "specialists",
    replace: "dolls",
    matchCase: false,
    wholeWord: true,
    enabled: true,
    scope: "everywhere",
    paths: [],
    selectors: [],
    excludeSelectors: [],
  },
  {
    id: "base-dolls-singular",
    find: "specialist",
    replace: "doll",
    matchCase: false,
    wholeWord: true,
    enabled: true,
    scope: "everywhere",
    paths: [],
    selectors: [],
    excludeSelectors: [],
  },
  {
    id: "base-service-plural",
    find: "visits",
    replace: "services",
    matchCase: false,
    wholeWord: true,
    enabled: true,
    scope: "everywhere",
    paths: [],
    selectors: [],
    excludeSelectors: [],
  },
  {
    id: "base-service-singular",
    find: "visit",
    replace: "service",
    matchCase: false,
    wholeWord: true,
    enabled: true,
    scope: "everywhere",
    paths: [],
    selectors: [],
    excludeSelectors: [],
  },
];

export function newPhraseRule(): PhraseRule {
  return {
    id: `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    find: "",
    replace: "",
    matchCase: false,
    wholeWord: true,
    enabled: true,
    scope: "everywhere",
    paths: [],
    selectors: [],
    excludeSelectors: [],
  };
}

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEXTAREA",
  "INPUT",
  "CODE",
  "PRE",
  "SVG",
  "PATH",
]);

const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;

const HITS_KEY = "ashnight.wording-hits";

/** Where each rule has actually rewritten copy: rule id → route path → count. */
export type PhraseHits = Record<string, Record<string, number>>;

export function readPhraseHits(): PhraseHits {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(HITS_KEY) ?? "{}") as PhraseHits;
  } catch {
    return {};
  }
}

export function clearPhraseHits() {
  if (typeof window !== "undefined") window.localStorage.removeItem(HITS_KEY);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Mirrors the source phrase's capitalisation onto the replacement. */
function matchShape(source: string, replacement: string) {
  if (source === source.toUpperCase() && source !== source.toLowerCase()) {
    return replacement.toUpperCase();
  }
  if (source[0] === source[0]?.toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

export interface RuleContext {
  path: string;
  element?: Element | null;
}

interface CompiledRule {
  id: string;
  pattern: RegExp;
  replace: string;
  matchCase: boolean;
  scope: PhraseRule["scope"];
  paths: string[];
  selectors: string[];
  excludeSelectors: string[];
}

/**
 * Older iOS WebViews (Safari < 16.4) throw a SyntaxError when a lookbehind
 * group is compiled, which would blank the whole app. Detect support once and
 * fall back to a word-boundary pattern on those devices.
 */
const SUPPORTS_LOOKBEHIND = (() => {
  try {
    // eslint-disable-next-line prefer-regex-literals
    new RegExp("(?<!a)b");
    return true;
  } catch {
    return false;
  }
})();

function buildPattern(body: string, wholeWord: boolean, matchCase: boolean): RegExp {
  const flags = matchCase ? "gu" : "giu";
  if (!wholeWord) return new RegExp(body, flags);
  if (SUPPORTS_LOOKBEHIND) {
    try {
      return new RegExp(`(?<![\\p{L}\\d])${body}(?![\\p{L}\\d])`, flags);
    } catch {
      /* fall through to the boundary variant */
    }
  }
  return new RegExp(`\\b${body}\\b`, matchCase ? "g" : "gi");
}

export function compileRules(rules: PhraseRule[]): CompiledRule[] {
  return rules
    .filter((rule) => rule.enabled && rule.find.trim().length > 0)
    .map((rule) => {
      const body = escapeRegExp(rule.find.trim());
      return {
        id: rule.id,
        pattern: buildPattern(body, Boolean(rule.wholeWord), rule.matchCase),
        replace: rule.replace,
        matchCase: rule.matchCase,
        scope: rule.scope ?? "everywhere",
        paths: rule.paths ?? [],
        selectors: rule.selectors ?? [],
        excludeSelectors: rule.excludeSelectors ?? [],
      };
    });
}


function pathMatches(path: string, pattern: string): boolean {
  const normalized = path.replace(/\/$/, "") || "/";
  const pat = pattern.replace(/\/$/, "") || "/";
  if (pat === normalized) return true;
  if (pat.endsWith("/*")) {
    const prefix = pat.slice(0, -1).replace(/\/$/, "");
    return normalized === prefix || normalized.startsWith(prefix + "/");
  }
  const regex = new RegExp("^" + escapeRegExp(pat).replace(/\\\*$/, ".*") + "$");
  return regex.test(normalized);
}

function ruleApplies(rule: CompiledRule, ctx: RuleContext): boolean {
  if (ctx.element && rule.excludeSelectors.length > 0) {
    if (rule.excludeSelectors.some((sel) => ctx.element!.closest(sel))) return false;
  }

  switch (rule.scope) {
    case "everywhere":
      return true;
    case "exclude-admin":
      return !ctx.path.startsWith("/ashnight-control");
    case "routes":
      if (rule.paths.length === 0) return false;
      return rule.paths.some((p) => pathMatches(ctx.path, p));
    case "exclude-routes":
      if (rule.paths.length === 0) return true;
      return !rule.paths.some((p) => pathMatches(ctx.path, p));
    case "selectors":
      if (!ctx.element || rule.selectors.length === 0) return false;
      return rule.selectors.some((sel) => ctx.element!.closest(sel));
    default:
      return true;
  }
}

/** Applies every rule to one string, returning the text and per-rule hit counts. */
export function applyRules(
  input: string,
  compiled: CompiledRule[],
  ctx: RuleContext,
  hits?: Record<string, number>,
) {
  let output = input;
  for (const rule of compiled) {
    if (!ruleApplies(rule, ctx)) continue;
    rule.pattern.lastIndex = 0;
    if (!rule.pattern.test(output)) continue;
    rule.pattern.lastIndex = 0;
    output = output.replace(rule.pattern, (matched) => {
      if (hits) hits[rule.id] = (hits[rule.id] ?? 0) + 1;
      return rule.matchCase ? rule.replace : matchShape(matched, rule.replace);
    });
  }
  return output;
}

/** Counts how many times each rule would fire against a block of text. */
export function countMatches(text: string, rules: PhraseRule[], ctx: RuleContext = { path: "/" }) {
  const hits: Record<string, number> = {};
  applyRules(text, compileRules(rules), ctx, hits);
  return hits;
}

function shouldSkip(node: Node) {
  let element = node.parentElement;
  while (element) {
    if (SKIP_TAGS.has(element.tagName)) return true;
    if (element.hasAttribute("data-no-reword")) return true;
    element = element.parentElement;
  }
  return false;
}

/**
 * Mounted once in the root layout. Keeps rendered copy in sync with the
 * admin's wording rules on every page of the site and inside the native shell.
 */
export function WordingOverrides() {
  const { locale } = useLocaleSettings();
  const rules = useMemo(
    () => [...BASE_PHRASE_RULES, ...(locale.phrases ?? [])],
    [locale.phrases],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const compiled = compileRules(rules);
    if (compiled.length === 0) return;

    let scheduled = 0;
    const hits: Record<string, number> = {};

    function rewriteText(root: Node, ctx: RuleContext) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const pending: Text[] = [];
      let current = walker.nextNode();
      while (current) {
        pending.push(current as Text);
        current = walker.nextNode();
      }
      for (const textNode of pending) {
        const value = textNode.nodeValue;
        if (!value || !value.trim() || shouldSkip(textNode)) continue;
        const next = applyRules(value, compiled, { ...ctx, element: textNode.parentElement }, hits);
        if (next !== value) textNode.nodeValue = next;
      }
    }

    function rewriteAttributes(root: ParentNode, ctx: RuleContext) {
      for (const attr of ATTRS) {
        for (const element of Array.from(root.querySelectorAll(`[${attr}]`))) {
          if (element.closest("[data-no-reword]")) continue;
          const value = element.getAttribute(attr);
          if (!value || !value.trim()) continue;
          const next = applyRules(value, compiled, { ...ctx, element }, hits);
          if (next !== value) element.setAttribute(attr, next);
        }
      }
    }

    function persistHits() {
      if (Object.keys(hits).length === 0) return;
      const path = window.location.pathname;
      const stored = readPhraseHits();
      for (const [ruleId, count] of Object.entries(hits)) {
        const perRoute = stored[ruleId] ?? {};
        perRoute[path] = Math.max(perRoute[path] ?? 0, count);
        stored[ruleId] = perRoute;
        delete hits[ruleId];
      }
      try {
        window.localStorage.setItem(HITS_KEY, JSON.stringify(stored));
      } catch {
        /* storage full or blocked — hit tracking is best-effort only */
      }
    }

    function run() {
      const ctx: RuleContext = { path: window.location.pathname };
      observer.disconnect();
      rewriteText(document.body, ctx);
      rewriteAttributes(document.body, ctx);
      const title = document.title;
      const nextTitle = applyRules(title, compiled, ctx);
      if (nextTitle !== title) document.title = nextTitle;
      persistHits();
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    function schedule() {
      if (scheduled) return;
      scheduled = window.requestAnimationFrame(() => {
        scheduled = 0;
        run();
      });
    }

    const observer = new MutationObserver(schedule);
    run();

    return () => {
      if (scheduled) window.cancelAnimationFrame(scheduled);
      observer.disconnect();
    };
  }, [rules]);

  return null;
}
