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
}

export function newPhraseRule(): PhraseRule {
  return {
    id: `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    find: "",
    replace: "",
    matchCase: false,
    wholeWord: true,
    enabled: true,
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

interface CompiledRule {
  id: string;
  pattern: RegExp;
  replace: string;
  matchCase: boolean;
}

export function compileRules(rules: PhraseRule[]): CompiledRule[] {
  return rules
    .filter((rule) => rule.enabled && rule.find.trim().length > 0)
    .map((rule) => {
      const body = escapeRegExp(rule.find.trim());
      const source = rule.wholeWord ? `(?<![\\p{L}\\d])${body}(?![\\p{L}\\d])` : body;
      return {
        id: rule.id,
        pattern: new RegExp(source, rule.matchCase ? "gu" : "giu"),
        replace: rule.replace,
        matchCase: rule.matchCase,
      };
    });
}

/** Applies every rule to one string, returning the text and per-rule hit counts. */
export function applyRules(
  input: string,
  compiled: CompiledRule[],
  hits?: Record<string, number>,
) {
  let output = input;
  for (const rule of compiled) {
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
export function countMatches(text: string, rules: PhraseRule[]) {
  const hits: Record<string, number> = {};
  applyRules(text, compileRules(rules), hits);
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
  const rules = useMemo(() => locale.phrases ?? [], [locale.phrases]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const compiled = compileRules(rules);
    if (compiled.length === 0) return;

    let scheduled = 0;
    const hits: Record<string, number> = {};

    function rewriteText(root: Node) {
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
        const next = applyRules(value, compiled, hits);
        if (next !== value) textNode.nodeValue = next;
      }
    }

    function rewriteAttributes(root: ParentNode) {
      for (const attr of ATTRS) {
        for (const element of Array.from(root.querySelectorAll(`[${attr}]`))) {
          if (element.closest("[data-no-reword]")) continue;
          const value = element.getAttribute(attr);
          if (!value || !value.trim()) continue;
          const next = applyRules(value, compiled, hits);
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
      observer.disconnect();
      rewriteText(document.body);
      rewriteAttributes(document.body);
      const title = document.title;
      const nextTitle = applyRules(title, compiled);
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
