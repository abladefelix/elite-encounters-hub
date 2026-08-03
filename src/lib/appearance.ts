/**
 * Admin-owned appearance settings for the client app.
 *
 * Controls how member-facing pages are composed (layout, density, sections)
 * and the theme accents applied on top of the design tokens. The control room
 * keeps its own desktop styling and is never affected by these values.
 */
import { useSettingsSection } from "./platform-settings";

export type DirectoryLayout = "rows" | "grid";
export type TileAspect = "square" | "portrait" | "tall";
export type Density = "compact" | "cozy" | "roomy";

/** Composable blocks on the signed-in client landing page (`/rooms`). */
export const PAGE_SECTIONS = [
  { key: "spotlight", label: "Top-rated spotlight card" },
  { key: "rows", label: "Swipeable specialist rows" },
  { key: "dashboard", label: "Member dashboard strip" },
  { key: "pricing", label: "Membership room pricing" },
  { key: "comparison", label: "Room comparison table" },
] as const;

export type PageSectionKey = (typeof PAGE_SECTIONS)[number]["key"];

/** Groups the swipeable roster rows are built from, in display order. */
export const ROSTER_GROUPS = [
  { key: "online", label: "Available now" },
  { key: "top", label: "Top rated" },
  { key: "new", label: "New on Ashnight" },
  { key: "affordable", label: "Best value" },
] as const;

export type RosterGroupKey = (typeof ROSTER_GROUPS)[number]["key"];

export interface AppearanceSettings {
  /** How the specialist directory presents the roster. */
  directoryLayout: DirectoryLayout;
  /** Faces per swipeable row. */
  rowSize: number;
  /** Cards per page when the directory is a paged grid. */
  gridPageSize: number;
  /** Face crop used by the compact tiles. */
  tileAspect: TileAspect;
  /** Spacing scale applied to member pages. */
  density: Density;
  /** Corner radius in rem for member pages. */
  cornerRadius: number;
  /** Body/heading type scale multiplier for member pages. */
  fontScale: number;
  /** Optional accent override (hex). Empty keeps the brass design token. */
  accentColor: string;
  /** Which roster rows are shown, in order. */
  rosterGroups: RosterGroupKey[];
  /** Which landing-page sections are shown, in order. */
  sections: PageSectionKey[];
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  directoryLayout: "rows",
  rowSize: 12,
  gridPageSize: 24,
  tileAspect: "portrait",
  density: "cozy",
  cornerRadius: 0.75,
  fontScale: 1,
  accentColor: "",
  rosterGroups: ["online", "top", "new"],
  sections: ["spotlight", "rows", "dashboard", "pricing", "comparison"],
};

export const DENSITY_GAP: Record<Density, string> = {
  compact: "0.5rem",
  cozy: "0.75rem",
  roomy: "1.25rem",
};

export const TILE_ASPECT_CLASS: Record<TileAspect, string> = {
  square: "aspect-square",
  portrait: "aspect-[4/5]",
  tall: "aspect-[3/4]",
};

export function useAppearance() {
  const { value, save, loading } = useSettingsSection<AppearanceSettings>(
    "appearance",
    DEFAULT_APPEARANCE,
  );
  return { appearance: value, save, loading };
}

/** Section helpers so pages can honour both order and on/off state. */
export function sectionEnabled(appearance: AppearanceSettings, key: PageSectionKey) {
  return appearance.sections.includes(key);
}

export function orderedSections(appearance: AppearanceSettings) {
  return appearance.sections.filter((key) =>
    PAGE_SECTIONS.some((section) => section.key === key),
  );
}
