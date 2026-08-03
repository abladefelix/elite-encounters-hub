/**
 * Dry-run scanner for site-wide wording rules.
 *
 * Before an admin saves a find/replace rule they need to know exactly which
 * pages and which sentences it will rewrite. This module renders each site page
 * in a hidden same-origin iframe, walks the rendered copy the same way the live
 * `WordingOverrides` engine does, and reports every string that would change —
 * without touching the real DOM or saving anything.
 */
import { applyRules, compileRules, type PhraseRule } from "./phrase-overrides";

/** Pages the preview walks. Ordered the way an admin thinks about the site. */
export const PREVIEW_ROUTES: { path: string; label: string }[] = [
  { path: "/", label: "Sign in / sign up" },
  { path: "/apply", label: "Apply as specialist" },
  { path: "/how-it-works", label: "How it works" },
  { path: "/rooms", label: "Rooms & pricing" },
  { path: "/specialists", label: "Specialist directory" },
  { path: "/messages", label: "Messages & chat" },
  { path: "/wallet", label: "Money & escrow" },
  { path: "/profile", label: "Member profile" },
  { path: "/welcome", label: "Welcome screen" },
  { path: "/support", label: "Support" },
  { path: "/legal", label: "Terms & privacy" },
  { path: "/ashnight-control", label: "Control room (admin)" },
];

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

export interface PreviewChange {
  ruleId: string;
  /** "text" for visible copy, or the attribute name for tooltips/labels. */
  kind: string;
  before: string;
  after: string;
  /** Rough location, e.g. "button", "h1". */
  where: string;
}

export interface PreviewPage {
  path: string;
  label: string;
  changes: PreviewChange[];
  /** Set when the page could not be loaded or read. */
  error?: string;
}

function describe(element: Element | null): string {
  if (!element) return "text";
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute("role");
  return role ? `${tag}[${role}]` : tag;
}

function skipNode(node: Node): boolean {
  let element = node.parentElement;
  while (element) {
    if (SKIP_TAGS.has(element.tagName)) return true;
    if (element.hasAttribute("data-no-reword")) return true;
    element = element.parentElement;
  }
  return false;
}

/** Collects every change the rules would make inside one rendered document. */
export function collectChanges(
  doc: Document,
  rules: PhraseRule[],
  path: string,
): PreviewChange[] {
  const compiled = compileRules(rules);
  const changes: PreviewChange[] = [];
  const seen = new Set<string>();

  const push = (change: PreviewChange) => {
    const key = `${change.ruleId}|${change.kind}|${change.before}`;
    if (seen.has(key)) return;
    seen.add(key);
    changes.push(change);
  };

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    const value = current.nodeValue ?? "";
    if (value.trim() && !skipNode(current)) {
      const element = current.parentElement;
      for (const rule of compiled) {
        const hits: Record<string, number> = {};
        const after = applyRules(value, [rule], { path, element }, hits);
        if (after !== value) {
          push({
            ruleId: rule.id,
            kind: "text",
            before: value.trim(),
            after: after.trim(),
            where: describe(element),
          });
        }
      }
    }
    current = walker.nextNode();
  }

  for (const attr of ATTRS) {
    for (const element of Array.from(doc.body.querySelectorAll(`[${attr}]`))) {
      if (element.closest("[data-no-reword]")) continue;
      const value = element.getAttribute(attr);
      if (!value || !value.trim()) continue;
      for (const rule of compiled) {
        const after = applyRules(value, [rule], { path, element });
        if (after !== value) {
          push({
            ruleId: rule.id,
            kind: attr,
            before: value,
            after,
            where: describe(element),
          });
        }
      }
    }
  }

  return changes;
}

/** Loads one route off-screen and returns the changes the rules would make. */
async function scanRoute(
  route: { path: string; label: string },
  rules: PhraseRule[],
  settleMs: number,
): Promise<PreviewPage> {
  return new Promise<PreviewPage>((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("tabindex", "-1");
    frame.style.cssText =
      "position:fixed;left:-10000px;top:0;width:1200px;height:1600px;border:0;opacity:0;pointer-events:none";
    frame.src = route.path;

    let done = false;
    const finish = (page: PreviewPage) => {
      if (done) return;
      done = true;
      window.clearTimeout(timeout);
      frame.remove();
      resolve(page);
    };

    const timeout = window.setTimeout(
      () => finish({ ...route, changes: [], error: "Page took too long to load" }),
      12000,
    );

    frame.addEventListener("load", () => {
      window.setTimeout(() => {
        try {
          const doc = frame.contentDocument;
          if (!doc?.body) {
            finish({ ...route, changes: [], error: "Page could not be read" });
            return;
          }
          finish({ ...route, changes: collectChanges(doc, rules, route.path) });
        } catch {
          finish({ ...route, changes: [], error: "Page could not be read" });
        }
      }, settleMs);
    });

    document.body.appendChild(frame);
  });
}

/**
 * Walks every preview route in sequence, reporting progress as it goes so the
 * admin can watch the dry run instead of staring at a spinner.
 */
export async function previewWordingRules(
  rules: PhraseRule[],
  options: {
    onProgress?: (done: number, total: number, label: string) => void;
    settleMs?: number;
    routes?: { path: string; label: string }[];
  } = {},
): Promise<PreviewPage[]> {
  const routes = options.routes ?? PREVIEW_ROUTES;
  const active = rules.filter((rule) => rule.enabled && rule.find.trim().length > 0);
  if (active.length === 0) return [];

  const pages: PreviewPage[] = [];
  for (let index = 0; index < routes.length; index += 1) {
    const route = routes[index]!;
    options.onProgress?.(index, routes.length, route.label);
    pages.push(await scanRoute(route, active, options.settleMs ?? 900));
  }
  options.onProgress?.(routes.length, routes.length, "Done");
  return pages;
}
