/**
 * Backup configuration.
 *
 * The admin decides where nightly snapshots land (Dropbox, Google Drive or
 * both), what folder to use, how many copies to keep and which hour to run.
 * Credentials themselves live in the admin-only key vault
 * (`integration_keys`) — only the non-secret preferences live here.
 */
import { useSettingsSection } from "@/lib/platform-settings";

export interface BackupRunSummary {
  at: string;
  ok: boolean;
  file: string;
  bytes: number;
  tables: number;
  destinations: { provider: string; ok: boolean; detail: string }[];
}

export interface BackupConfig {
  /** Master switch for the scheduled endpoint. */
  enabled: boolean;
  dropboxEnabled: boolean;
  driveEnabled: boolean;
  /** Dropbox path prefix, e.g. /ashnight-backups */
  dropboxFolder: string;
  /** Google Drive folder ID (blank = the account's My Drive root). */
  driveFolderId: string;
  /** Label shown in the control room so you know which account is wired. */
  dropboxAccountLabel: string;
  driveAccountLabel: string;
  /** UTC hour the cron job is expected to fire — documentation for the admin. */
  scheduleHourUtc: number;
  /** How many snapshots to keep in each destination. */
  keepCopies: number;
  /** Include storage object listings (avatars/attachments) in the snapshot. */
  includeStorageIndex: boolean;
  lastRun: BackupRunSummary | null;
}

export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  enabled: false,
  dropboxEnabled: false,
  driveEnabled: false,
  dropboxFolder: "/ashnight-backups",
  driveFolderId: "",
  dropboxAccountLabel: "",
  driveAccountLabel: "",
  scheduleHourUtc: 2,
  keepCopies: 30,
  includeStorageIndex: true,
  lastRun: null,
};

export function useBackupConfig() {
  return useSettingsSection<BackupConfig>("backups", DEFAULT_BACKUP_CONFIG);
}
