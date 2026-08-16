/**
 * Maintenance & self-healing settings.
 *
 * The control room owns one switch board for app-wide health: whether the
 * platform runs automatic repair scans, whether safe repairs apply themselves,
 * which fixes always need an admin's approval, and whether the member app is
 * placed in maintenance mode. Only admins can change any of it.
 */
import { useSettingsSection } from "@/lib/platform-settings";

export type RepairRisk = "safe" | "review";
export type RepairStatus =
  | "pending"
  | "applied"
  | "skipped"
  | "reverted"
  | "failed";

export interface MaintenanceConfig {
  /** Master switch for the whole maintenance engine. */
  enabled: boolean;
  /** Run a health scan automatically whenever an admin opens the page. */
  scanOnOpen: boolean;
  /** Apply low-risk repairs without waiting for approval. */
  autoFixSafe: boolean;
  /**
   * Repairs marked "review" always create a pending run with a backup
   * snapshot that an admin has to approve or skip. Turning this off lets the
   * engine apply them too (still snapshotted, still revertable).
   */
  requireApprovalForRisky: boolean;
  /** Keep the before-change snapshot so a fix can be rolled back. */
  keepSnapshots: boolean;
  /** Snapshots older than this many days are cleared on the next scan. */
  snapshotRetentionDays: number;
  /** Log every error the app throws in the browser into the error inbox. */
  captureClientErrors: boolean;
  /** Members see a maintenance screen; admins keep full access. */
  maintenanceMode: boolean;
  maintenanceMessage: string;
}

export const DEFAULT_MAINTENANCE_CONFIG: MaintenanceConfig = {
  enabled: true,
  scanOnOpen: true,
  autoFixSafe: true,
  requireApprovalForRisky: true,
  keepSnapshots: true,
  snapshotRetentionDays: 30,
  captureClientErrors: true,
  maintenanceMode: false,
  maintenanceMessage:
    "Ashnight is under a short maintenance window. Everything will be back in a few minutes — your bookings and escrow are untouched.",
};

export function useMaintenanceConfig() {
  return useSettingsSection<MaintenanceConfig>("maintenance", DEFAULT_MAINTENANCE_CONFIG);
}

export const RISK_LABEL: Record<RepairRisk, string> = {
  safe: "Low risk",
  review: "Needs approval",
};

export const STATUS_LABEL: Record<RepairStatus, string> = {
  pending: "Awaiting approval",
  applied: "Applied",
  skipped: "Skipped",
  reverted: "Rolled back",
  failed: "Failed",
};
