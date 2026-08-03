import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Globe,
  Languages,
  LayoutTemplate,
  Loader2,
  MapPin,
  MessageSquareHeart,
  Palette,
  Plus,
  Replace,
  RotateCcw,
  Save,
  ScanSearch,
  Search,

  Shield,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { BrandMark } from "@/components/brand-mark";
import { LogoPicker } from "@/components/logo-picker";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_BRANDING, useBranding, type BrandingSettings } from "@/lib/branding";
import {
  COPY_GROUPS,
  DEFAULT_COPY,
  LOCALE_LANGUAGES,
  useLocaleSettings,
  type LocaleSettings,
} from "@/lib/locale";
import {
  DEFAULT_WELCOME_SETTINGS,
  WELCOME_TOKENS,
  renderWelcomeCopy,
  useWelcomeSettings,
  type WelcomeSettings,
} from "@/lib/welcome-message";
import {
  clearPhraseHits,
  newPhraseRule,
  readPhraseHits,
  type PhraseRule,
} from "@/lib/phrase-overrides";

export const Route = createFileRoute("/ashnight-control/branding")({
  head: () => ({
    meta: [
      { title: "Brand, Wording & Welcome Message | Ashnight Admin" },
      {
        name: "description",
        content:
          "Edit the logo, brand name and taglines, reword every platform term for your market, and write the welcome message new members receive after registration.",
      },
      { property: "og:title", content: "Brand, Wording & Welcome Message | Ashnight Admin" },
      {
        property: "og:description",
        content: "Logo, taglines, localized wording and the automated welcome message.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminBranding,
});

function AdminBranding() {
  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow text-muted-foreground">Control room</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
          Brand, wording &amp; welcome
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Your logo, name and taglines, the words the platform uses everywhere, and the message a
          new member receives the moment they register — all editable, no deploy needed.
        </p>
      </header>

      <BrandingCard />
      <WelcomeCard />
      <LanguageCard />
      <SiteWordingCard />
    </div>
  );
}

/* ------------------------------------------------------------------ branding */

function BrandingCard() {
  const { branding, save, loading } = useBranding();
  const [draft, setDraft] = useState<BrandingSettings>(branding);
  const [busy, setBusy] = useState(false);

  useEffect(() => setDraft(branding), [branding]);

  function set<K extends keyof BrandingSettings>(key: K, value: BrandingSettings[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function commit(next: BrandingSettings) {
    setBusy(true);
    try {
      await save(next);
      toast.success("Brand identity saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the brand identity");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-border/70 bg-panel p-5 sm:p-6">
      <SectionHead
        icon={<Palette className="size-4" />}
        title="Logo, name & taglines"
        blurb="Used on the public site, the sign-in screen, emails and this control room."
      />

      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface p-4">
            <BrandMark className="size-12" logoUrl={draft.logoUrl} alt={draft.logoAlt} />
            <div className="min-w-0">
              <p className="font-display text-lg font-semibold tracking-tight">
                {draft.name || "Your brand"}
                {draft.showAccentDot ? <span className="text-primary">.</span> : null}
              </p>
              <p className="truncate text-xs text-muted-foreground">{draft.tagline}</p>
            </div>
          </div>

          <div className="mt-4">
            <LogoPicker
              value={draft.logoUrl}
              alt={draft.logoAlt || draft.name}
              onChange={(url) => set("logoUrl", url)}
            />
          </div>



          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Brand name" value={draft.name} onChange={(v) => set("name", v)} />
            <Field
              label="Support email"
              value={draft.supportEmail}
              onChange={(v) => set("supportEmail", v)}
            />
            <Field
              label="Logo image URL"
              hint="Or paste a hosted URL. Leave empty to use the built-in brass mark."
              value={draft.logoUrl.startsWith("data:") ? "" : draft.logoUrl}
              placeholder={draft.logoUrl.startsWith("data:") ? "Uploaded image in use" : "https://…/logo.png"}
              onChange={(v) => set("logoUrl", v)}
            />

            <Field
              label="Logo alt text"
              value={draft.logoAlt}
              placeholder={draft.name}
              onChange={(v) => set("logoAlt", v)}
            />
          </div>

          <div className="mt-4 space-y-4">
            <Field
              label="Tagline"
              hint="One line under the name on the sign-in screen."
              value={draft.tagline}
              onChange={(v) => set("tagline", v)}
            />
            <AreaField
              label="Description"
              hint="Longer positioning line used in the footer."
              value={draft.description}
              onChange={(v) => set("description", v)}
            />
            <AreaField
              label="Legal / small print"
              value={draft.legalLine}
              onChange={(v) => set("legalLine", v)}
            />
          </div>

          <label className="mt-4 flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2.5">
            <span className="text-sm">
              Accent dot after the wordmark
              <span className="ml-1 text-muted-foreground">(Ashnight<span className="text-primary">.</span>)</span>
            </span>
            <Switch
              checked={draft.showAccentDot}
              onCheckedChange={(checked) => set("showAccentDot", checked)}
            />
          </label>

          <Actions
            busy={busy}
            onSave={() => void commit(draft)}
            onReset={() => void commit(DEFAULT_BRANDING)}
          />
        </>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------- welcome */

function WelcomeCard() {
  const { welcome, save, loading } = useWelcomeSettings();
  const { branding } = useBranding();
  const [draft, setDraft] = useState<WelcomeSettings>(welcome);
  const [busy, setBusy] = useState(false);

  useEffect(() => setDraft(welcome), [welcome]);

  async function commit(next: WelcomeSettings) {
    setBusy(true);
    try {
      await save(next);
      toast.success("Welcome message saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the welcome message");
    } finally {
      setBusy(false);
    }
  }

  const audiences: { key: "client" | "specialist"; label: string }[] = [
    { key: "client", label: "New client" },
    { key: "specialist", label: "New specialist" },
  ];

  return (
    <Card className="border-border/70 bg-panel p-5 sm:p-6">
      <SectionHead
        icon={<MessageSquareHeart className="size-4" />}
        title="Welcome message after registration"
        blurb="Delivered to the member's notification inbox the moment their account is created."
      />

      {loading ? (
        <Loading />
      ) : (
        <>
          <label className="mt-5 flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2.5">
            <span className="text-sm">Send a welcome message on registration</span>
            <Switch
              checked={draft.enabled}
              onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, enabled: checked }))}
            />
          </label>

          <p className="mt-3 text-xs text-muted-foreground">
            Tokens:{" "}
            {WELCOME_TOKENS.map((entry) => (
              <span key={entry.token} className="mr-2 inline-block">
                <code className="rounded bg-secondary px-1 py-0.5 font-mono">{entry.token}</code>{" "}
                {entry.hint}
              </span>
            ))}
          </p>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {audiences.map((audience) => {
              const copy = draft[audience.key];
              return (
                <div
                  key={audience.key}
                  className="space-y-3 rounded-xl border border-border bg-surface p-4"
                >
                  <h3 className="text-sm font-semibold">{audience.label}</h3>
                  <Field
                    label="Title"
                    value={copy.title}
                    onChange={(v) =>
                      setDraft((prev) => ({
                        ...prev,
                        [audience.key]: { ...prev[audience.key], title: v },
                      }))
                    }
                  />
                  <AreaField
                    label="Message"
                    value={copy.body}
                    rows={5}
                    onChange={(v) =>
                      setDraft((prev) => ({
                        ...prev,
                        [audience.key]: { ...prev[audience.key], body: v },
                      }))
                    }
                  />
                  <Field
                    label="Link"
                    hint="Where the notification takes them."
                    value={copy.link}
                    placeholder="/specialists"
                    onChange={(v) =>
                      setDraft((prev) => ({
                        ...prev,
                        [audience.key]: { ...prev[audience.key], link: v },
                      }))
                    }
                  />
                  <div className="rounded-lg border border-dashed border-border p-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Preview
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {renderWelcomeCopy(copy.title, { name: "Akua Mensah", brand: branding.name })}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {renderWelcomeCopy(copy.body, { name: "Akua Mensah", brand: branding.name })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <Actions
            busy={busy}
            onSave={() => void commit(draft)}
            onReset={() => void commit(DEFAULT_WELCOME_SETTINGS)}
          />
        </>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------- locale */

function LanguageCard() {
  const { locale, save, loading } = useLocaleSettings();
  const [draft, setDraft] = useState<LocaleSettings>(locale);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => setDraft(locale), [locale]);

  const term = search.trim().toLowerCase();
  const groups = COPY_GROUPS.map((group) => ({
    ...group,
    keys: group.keys.filter(
      (entry) =>
        !term ||
        entry.label.toLowerCase().includes(term) ||
        entry.value.toLowerCase().includes(term) ||
        entry.key.toLowerCase().includes(term) ||
        entry.usedIn.some((place) => place.toLowerCase().includes(term)),
    ),
  })).filter((group) => group.keys.length > 0);


  async function commit(next: LocaleSettings) {
    setBusy(true);
    try {
      await save(next);
      toast.success("Language settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the language settings");
    } finally {
      setBusy(false);
    }
  }

  function setWord(key: string, value: string) {
    setDraft((prev) => ({ ...prev, copy: { ...(prev.copy ?? {}), [key]: value } }));
  }

  return (
    <Card className="border-border/70 bg-panel p-5 sm:p-6" data-no-reword>
      <SectionHead
        icon={<Languages className="size-4" />}
        title="Language & wording"
        blurb="Reword any platform term. Blank fields fall back to the shipped wording."
      />

      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <Label className="text-xs text-muted-foreground">Language</Label>
              <Select
                value={draft.language}
                onValueChange={(value) => setDraft((prev) => ({ ...prev, language: value }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCALE_LANGUAGES.map((entry) => (
                    <SelectItem key={entry.code} value={entry.code}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field
              label="Number / date locale"
              hint="Leave empty to follow the language."
              value={draft.formatLocale}
              placeholder="en-GH"
              onChange={(v) => setDraft((prev) => ({ ...prev, formatLocale: v }))}
            />
            <Field
              label="Currency label"
              value={draft.currencyLabel}
              onChange={(v) => setDraft((prev) => ({ ...prev, currencyLabel: v }))}
            />
          </div>

          <div className="mt-6">
            <Label className="text-xs text-muted-foreground">Find a word</Label>
            <div className="relative mt-1 max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search wording or where it appears…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Room tier names such as “Ultimate” are edited per room under{" "}
              <span className="font-medium text-foreground">Rooms &amp; pricing</span> — this page
              handles the shared wording below.
            </p>
          </div>

          <div className="mt-5 space-y-6">
            {groups.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No wording matches “{search}”.
              </p>
            ) : null}
            {groups.map((group) => (
              <section key={group.id}>
                <h3 className="text-sm font-semibold">{group.title}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{group.blurb}</p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.keys.map((entry) => (
                    <div key={entry.key} className="min-w-0">
                      <Field
                        label={entry.label}
                        value={(draft.copy ?? {})[entry.key] ?? ""}
                        placeholder={DEFAULT_COPY[entry.key] ?? ""}
                        onChange={(v) => setWord(entry.key, v)}
                      />
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {entry.usedIn.map((place) => (
                          <span
                            key={place}
                            className="rounded-full border border-border/70 bg-secondary/60 px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {place}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>


          <Actions
            busy={busy}
            onSave={() => void commit(draft)}
            onReset={() => void commit({ ...draft, copy: {} })}
            resetLabel="Clear wording overrides"
          />
        </>
      )}
    </Card>
  );
}


/* ------------------------------------------------------- site-wide wording */

const SCOPE_OPTIONS: { value: PhraseRule["scope"]; label: string; hint: string; icon: React.ReactNode }[] = [
  {
    value: "everywhere",
    label: "Everywhere",
    hint: "Every page and screen",
    icon: <Globe className="size-3.5" />,
  },
  {
    value: "routes",
    label: "Only on pages",
    hint: "Limit to specific URLs",
    icon: <MapPin className="size-3.5" />,
  },
  {
    value: "exclude-routes",
    label: "Everywhere except pages",
    hint: "Skip specific URLs",
    icon: <Shield className="size-3.5" />,
  },
  {
    value: "selectors",
    label: "Only in sections",
    hint: "Limit to CSS selectors",
    icon: <LayoutTemplate className="size-3.5" />,
  },
  {
    value: "exclude-admin",
    label: "Everywhere except admin",
    hint: "Skip /ashnight-control/*",
    icon: <Shield className="size-3.5" />,
  },
];

/**
 * Free-form find/replace across the whole site and app.
 *
 * The keyed dictionary above covers the platform's core nouns; this covers
 * everything else — sentences, buttons, notices, headings — by rewriting
 * rendered text wherever it appears. The card is marked `data-no-reword` so the
 * rules never rewrite the editor showing them.
 */
function SiteWordingCard() {
  const { locale, save, loading } = useLocaleSettings();
  const [rules, setRules] = useState<PhraseRule[]>(locale.phrases ?? []);
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState(() => readPhraseHits());
  const [previewOpen, setPreviewOpen] = useState(false);


  useEffect(() => setRules(locale.phrases ?? []), [locale.phrases]);

  useEffect(() => {
    const timer = window.setInterval(() => setHits(readPhraseHits()), 4000);
    return () => window.clearInterval(timer);
  }, []);

  function update(id: string, patch: Partial<PhraseRule>) {
    setRules((prev) => prev.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  }

  async function commit(next: PhraseRule[]) {
    const cleaned = next.filter((rule) => rule.find.trim().length > 0);
    setBusy(true);
    try {
      await save({ ...locale, phrases: cleaned });
      toast.success(
        cleaned.length === 0
          ? "Site-wide wording rules cleared"
          : `${cleaned.length} wording rule${cleaned.length === 1 ? "" : "s"} live`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the wording rules");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-border/70 bg-panel p-5 sm:p-6" data-no-reword>
      <SectionHead
        icon={<Replace className="size-4" />}
        title="Site-wide find &amp; replace"
        blurb="Change any wording anywhere — inside sentences, buttons, notices and emails — across the website and the mobile app. Applies instantly to every member, no deploy."
      />

      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="mt-5 space-y-3">
            {rules.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/70 p-4 text-xs text-muted-foreground">
                No site-wide rules yet. Add one to rename anything the platform says — for example
                replace “Specialist” with “Cleaner”, or “Room” with “Tier”, everywhere at once.
              </p>
            ) : null}

            {rules.map((rule) => {
              const seen = Object.entries(hits[rule.id] ?? {}).sort((a, b) => b[1] - a[1]);
              const scope = SCOPE_OPTIONS.find((s) => s.value === rule.scope) ?? SCOPE_OPTIONS[0]!;
              return (
                <div key={rule.id} className="rounded-lg border border-border/70 bg-background/40 p-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <Field
                      label="Find this wording"
                      value={rule.find}
                      placeholder="Specialist"
                      onChange={(v) => update(rule.id, { find: v })}
                    />
                    <Field
                      label="Replace with"
                      value={rule.replace}
                      placeholder="Cleaner"
                      onChange={(v) => update(rule.id, { replace: v })}
                    />
                    <div className="flex items-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Remove this rule"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setRules((prev) => prev.filter((r) => r.id !== rule.id))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <ToggleLine
                      label="Live"
                      hint="Turn off to pause without deleting"
                      checked={rule.enabled}
                      onChange={(v) => update(rule.id, { enabled: v })}
                    />
                    <ToggleLine
                      label="Whole words only"
                      hint="“cat” won’t change “category”"
                      checked={rule.wholeWord}
                      onChange={(v) => update(rule.id, { wholeWord: v })}
                    />
                    <ToggleLine
                      label="Match capitals exactly"
                      hint="Off also handles Title Case and UPPERCASE"
                      checked={rule.matchCase}
                      onChange={(v) => update(rule.id, { matchCase: v })}
                    />
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Apply this rule</Label>
                      <Select
                        value={rule.scope}
                        onValueChange={(value) =>
                          update(rule.id, { scope: value as PhraseRule["scope"] })
                        }
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue>
                            <span className="flex items-center gap-2">
                              {scope.icon}
                              <span>{scope.label}</span>
                            </span>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {SCOPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              <span className="flex items-center gap-2">
                                {option.icon}
                                <span>{option.label}</span>
                              </span>
                              <span className="block text-[10px] text-muted-foreground">
                                {option.hint}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {(rule.scope === "routes" || rule.scope === "exclude-routes") && (
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {rule.scope === "routes" ? "Only on these pages" : "Except these pages"}
                        </Label>
                        <Input
                          className="mt-1"
                          value={rule.paths.join(", ")}
                          placeholder="/messages, /specialists/*, /rooms"
                          onChange={(event) =>
                            update(rule.id, {
                              paths: event.target.value
                                .split(/[,\n]+/)
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Comma-separated paths. Use * for wildcards.
                        </p>
                      </div>
                    )}

                    {rule.scope === "selectors" && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Only inside these sections</Label>
                        <Input
                          className="mt-1"
                          value={rule.selectors.join(", ")}
                          placeholder=".chat-header, [data-section='hero']"
                          onChange={(event) =>
                            update(rule.id, {
                              selectors: event.target.value
                                .split(/[,\n]+/)
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Comma-separated CSS selectors.
                        </p>
                      </div>
                    )}

                    <div>
                      <Label className="text-xs text-muted-foreground">Exclude sections (optional)</Label>
                      <Input
                        className="mt-1"
                        value={rule.excludeSelectors.join(", ")}
                        placeholder=".admin-only, [data-no-reword]"
                        onChange={(event) =>
                          update(rule.id, {
                            excludeSelectors: event.target.value
                              .split(/[,\n]+/)
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        CSS selectors to skip even if the rule otherwise matches.
                      </p>
                    </div>
                  </div>

                  {seen.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center gap-1">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Seen on
                      </span>
                      {seen.slice(0, 8).map(([path, count]) => (
                        <span
                          key={path}
                          className="rounded-full border border-border/70 bg-secondary/60 px-2 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {path} · {count}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRules((prev) => [...prev, newPhraseRule()])}
            >
              <Plus className="mr-2 size-3.5" /> Add wording rule
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={rules.every((rule) => !rule.enabled || !rule.find.trim())}
              onClick={() => setPreviewOpen(true)}
            >
              <ScanSearch className="mr-2 size-3.5" /> Preview changes
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                clearPhraseHits();
                setHits({});
                toast.success("Usage tracking reset");
              }}
            >
              <RotateCcw className="mr-2 size-3.5" /> Reset usage tracking
            </Button>
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground">
            “Preview changes” does a dry run across every page and lists the exact strings each rule
            would rewrite before anything is saved. “Seen on” then builds up as pages are visited.
            Use the scope dropdown to change a word in one place without changing it everywhere.
            Room tier names stay under Rooms &amp; pricing.
          </p>

          <Actions
            busy={busy}
            onSave={() => setPreviewOpen(true)}
            onReset={() => void commit([])}
            resetLabel="Clear all rules"
          />

          <WordingPreviewDialog
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            rules={rules}
            busy={busy}
            onConfirm={async () => {
              await commit(rules);
              setPreviewOpen(false);
            }}
          />

        </>
      )}
    </Card>
  );
}

function ToggleLine({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span className="min-w-0">
        <span className="block text-xs font-medium">{label}</span>
        <span className="block text-[10px] text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------- pieces */


function SectionHead({
  icon,
  title,
  blurb,
}: {
  icon: React.ReactNode;
  title: string;
  blurb: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary">{icon}</span>
      <div className="min-w-0">
        <h2 className="font-display text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" /> Loading…
    </p>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string | undefined;
  placeholder?: string | undefined;
}) {
  return (
    <div className="min-w-0">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        className="mt-1"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function AreaField({
  label,
  value,
  onChange,
  hint,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string | undefined;
  rows?: number;
}) {
  return (
    <div className="min-w-0">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Textarea
        className="mt-1"
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Actions({
  busy,
  onSave,
  onReset,
  resetLabel = "Reset to defaults",
}: {
  busy: boolean;
  onSave: () => void;
  onReset: () => void;
  resetLabel?: string;
}) {
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      <Button size="sm" disabled={busy} onClick={onSave}>
        {busy ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Save className="mr-2 size-3.5" />}
        Save changes
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={onReset}>
        <RotateCcw className="mr-2 size-3.5" /> {resetLabel}
      </Button>
    </div>
  );
}
