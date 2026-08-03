import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Crop,
  LayoutTemplate,
  Loader2,
  Palette,
  RotateCcw,
  Rows3,
  Save,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_APPEARANCE,
  PAGE_SECTIONS,
  ROSTER_GROUPS,
  useAppearance,
  type AppearanceSettings,
  type Density,
  type DirectoryLayout,
  type PageSectionKey,
  type RosterGroupKey,
  type TileAspect,
} from "@/lib/appearance";

export const Route = createFileRoute("/ashnight-control/appearance")({
  head: () => ({
    meta: [
      { title: "Appearance & Page Layout | Ashnight Admin" },
      {
        name: "description",
        content:
          "Control how the member app looks: swipeable specialist rows or a paged grid, face crops, spacing density, corner radius, type scale, accent colour and which page sections appear.",
      },
      { property: "og:title", content: "Appearance & Page Layout | Ashnight Admin" },
      {
        property: "og:description",
        content: "Layout, theme accents and page sections for the client app.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminAppearance,
});

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
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface text-primary">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-display text-base font-semibold">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{blurb}</p>
      </div>
    </div>
  );
}

function move<T>(list: T[], index: number, direction: -1 | 1) {
  const next = [...list];
  const target = index + direction;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target] as T, next[index] as T];
  return next;
}

function AdminAppearance() {
  const { appearance, save, loading } = useAppearance();
  const [draft, setDraft] = useState<AppearanceSettings>(appearance);
  const [busy, setBusy] = useState(false);

  useEffect(() => setDraft(appearance), [appearance]);

  function set<K extends keyof AppearanceSettings>(key: K, value: AppearanceSettings[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function commit(next: AppearanceSettings) {
    setBusy(true);
    try {
      await save(next);
      toast.success("Appearance saved — members see it on their next screen");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save appearance settings");
    } finally {
      setBusy(false);
    }
  }

  const orderedSectionKeys = draft.sections;
  const hiddenSections = PAGE_SECTIONS.filter(
    (section) => !orderedSectionKeys.includes(section.key),
  );

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow text-muted-foreground">Control room</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
          Appearance &amp; page layout
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Decide how the member app is composed and styled — the roster layout, spacing, radius,
          type scale, accent colour and which sections appear on the landing page. This control
          room keeps its own desktop styling and is never affected.
        </p>
      </header>

      {loading ? (
        <Card className="border-border/70 bg-panel p-6">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </Card>
      ) : (
        <>
          {/* ------------------------------------------------------- layout */}
          <Card className="border-border/70 bg-panel p-5 sm:p-6">
            <SectionHead
              icon={<Rows3 className="size-4" />}
              title="Specialist roster layout"
              blurb="Swipeable rows group the faces by availability and rating; a paged grid shows everyone with pagination."
            />

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Directory layout</Label>
                <Select
                  value={draft.directoryLayout}
                  onValueChange={(value) => set("directoryLayout", value as DirectoryLayout)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rows">Swipeable rows by group</SelectItem>
                    <SelectItem value="grid">Paged grid of faces</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Face crop</Label>
                <Select
                  value={draft.tileAspect}
                  onValueChange={(value) => set("tileAspect", value as TileAspect)}
                >
                  <SelectTrigger>
                    <Crop className="size-4 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="square">Square</SelectItem>
                    <SelectItem value="portrait">Portrait (4:5)</SelectItem>
                    <SelectItem value="tall">Tall (3:4)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Faces per swipeable row</Label>
                <Input
                  type="number"
                  min={4}
                  max={40}
                  value={draft.rowSize}
                  onChange={(event) => set("rowSize", Number(event.target.value) || 12)}
                />
              </div>

              <div className="space-y-2">
                <Label>Cards per page (grid layout)</Label>
                <Input
                  type="number"
                  min={6}
                  max={120}
                  value={draft.gridPageSize}
                  onChange={(event) => set("gridPageSize", Number(event.target.value) || 24)}
                />
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-border bg-surface p-4">
              <p className="text-sm font-medium">Rows shown, in order</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Each row is a swipeable strip of faces. Empty rows are skipped automatically.
              </p>
              <div className="mt-3 space-y-2">
                {ROSTER_GROUPS.map((group) => {
                  const index = draft.rosterGroups.indexOf(group.key);
                  const on = index >= 0;
                  return (
                    <div
                      key={group.key}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border/70 bg-panel px-3 py-2"
                    >
                      <p className="min-w-0 truncate text-sm">{group.label}</p>
                      <div className="flex shrink-0 items-center gap-1">
                        {on ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Move ${group.label} up`}
                              disabled={index === 0}
                              onClick={() =>
                                set("rosterGroups", move(draft.rosterGroups, index, -1))
                              }
                            >
                              <ArrowUp className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Move ${group.label} down`}
                              disabled={index === draft.rosterGroups.length - 1}
                              onClick={() =>
                                set("rosterGroups", move(draft.rosterGroups, index, 1))
                              }
                            >
                              <ArrowDown className="size-4" />
                            </Button>
                          </>
                        ) : null}
                        <Switch
                          checked={on}
                          aria-label={`Show ${group.label}`}
                          onCheckedChange={(checked) =>
                            set(
                              "rosterGroups",
                              checked
                                ? [...draft.rosterGroups, group.key as RosterGroupKey]
                                : draft.rosterGroups.filter((key) => key !== group.key),
                            )
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* -------------------------------------------------------- theme */}
          <Card className="border-border/70 bg-panel p-5 sm:p-6">
            <SectionHead
              icon={<Palette className="size-4" />}
              title="Spacing, radius & accent"
              blurb="Applied to member pages only. Leave the accent empty to keep the built-in brass token."
            />

            <div className="mt-5 grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Spacing density</Label>
                <Select
                  value={draft.density}
                  onValueChange={(value) => set("density", value as Density)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="cozy">Cozy</SelectItem>
                    <SelectItem value="roomy">Roomy</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="accent">Accent colour override</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="accent"
                    placeholder="#c9a84c"
                    value={draft.accentColor}
                    onChange={(event) => set("accentColor", event.target.value.trim())}
                  />
                  <span
                    aria-hidden="true"
                    className="size-9 shrink-0 rounded-lg border border-border"
                    style={{
                      background: /^#[0-9a-f]{6}$/i.test(draft.accentColor)
                        ? draft.accentColor
                        : "var(--primary)",
                    }}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label>Corner radius · {draft.cornerRadius.toFixed(2)}rem</Label>
                <Slider
                  value={[draft.cornerRadius]}
                  min={0}
                  max={2}
                  step={0.05}
                  onValueChange={([value]) => set("cornerRadius", value ?? 0.75)}
                />
              </div>

              <div className="space-y-3">
                <Label>Type scale · {Math.round(draft.fontScale * 100)}%</Label>
                <Slider
                  value={[draft.fontScale]}
                  min={0.85}
                  max={1.3}
                  step={0.01}
                  onValueChange={([value]) => set("fontScale", value ?? 1)}
                />
              </div>
            </div>
          </Card>

          {/* ----------------------------------------------------- sections */}
          <Card className="border-border/70 bg-panel p-5 sm:p-6">
            <SectionHead
              icon={<LayoutTemplate className="size-4" />}
              title="Landing page sections"
              blurb="What a signed-in client sees on their landing page, top to bottom. Turn a block off to hide it everywhere it appears."
            />

            <div className="mt-5 space-y-2">
              {orderedSectionKeys.map((key, index) => {
                const meta = PAGE_SECTIONS.find((section) => section.key === key);
                if (!meta) return null;
                return (
                  <div
                    key={key}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border/70 bg-surface px-3 py-2"
                  >
                    <p className="min-w-0 truncate text-sm">
                      <span className="mr-2 text-xs text-muted-foreground">{index + 1}</span>
                      {meta.label}
                    </p>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Move ${meta.label} up`}
                        disabled={index === 0}
                        onClick={() => set("sections", move(orderedSectionKeys, index, -1))}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Move ${meta.label} down`}
                        disabled={index === orderedSectionKeys.length - 1}
                        onClick={() => set("sections", move(orderedSectionKeys, index, 1))}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Switch
                        checked
                        aria-label={`Hide ${meta.label}`}
                        onCheckedChange={() =>
                          set(
                            "sections",
                            orderedSectionKeys.filter((item) => item !== key),
                          )
                        }
                      />
                    </div>
                  </div>
                );
              })}

              {hiddenSections.map((section) => (
                <div
                  key={section.key}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-dashed border-border/70 px-3 py-2 opacity-70"
                >
                  <p className="min-w-0 truncate text-sm text-muted-foreground">{section.label}</p>
                  <Switch
                    checked={false}
                    aria-label={`Show ${section.label}`}
                    onCheckedChange={() =>
                      set("sections", [...orderedSectionKeys, section.key as PageSectionKey])
                    }
                  />
                </div>
              ))}
            </div>
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button variant="brass" disabled={busy} onClick={() => void commit(draft)}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save appearance
            </Button>
            <Button
              variant="soft"
              disabled={busy}
              onClick={() => {
                setDraft(DEFAULT_APPEARANCE);
                void commit(DEFAULT_APPEARANCE);
              }}
            >
              <RotateCcw className="size-4" /> Reset to defaults
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
