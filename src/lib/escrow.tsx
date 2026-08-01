import {
  createContext,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { useSettingsSection } from "@/lib/platform-settings";
import { confirmEscrowComplete, raiseEscrowIssue } from "@/lib/payments.functions";
import {
  useEscrowEntries,
  useEscrowMutations,
  type EscrowRow,
} from "@/lib/queries";
import type { Database } from "@/integrations/supabase/types";


/**
 * Escrow engine — now backed by the real `escrow_entries` table.
 *
 * Every booking payment and every cash gift lands in escrow instead of going
 * straight to the specialist. Money moves through a small state machine:
 *
 *   pending ─▶ held ──(client confirms)──▶ clearing ──(hold window elapses)──▶ released
 *      │          │                          │
 *      │          └──────(issue raised)──────┴──▶ disputed ──▶ released | refunded
 *      └─(escrow switched off)─▶ released immediately
 *
 * `release_at` is computed and stored on the row the moment clearing starts
 * (paid_at + hold_hours). The clearing → released step SHOULD be performed by
 * a scheduled server job (added in the payments phase) so payouts settle even
 * with no browser open. Until that job exists, `useEscrow()` performs the same
 * flip client-side, once, whenever a member or admin loads escrow data — see
 * `releaseOverdueEntries` below. This is a stopgap, not the source of truth.
 */

/* ---------------------------------------------------------------- settings */

export interface EscrowSettings {
  /** Master switch. Off means funds settle to the specialist immediately. */
  escrowEnabled: boolean;
  /** Hours funds sit in clearing before automatic deposit. */
  holdHours: number;
  /** Timer only starts once the client marks the visit complete. */
  requireClientConfirm: boolean;
  /** If the client never confirms, start clearing anyway after this many hours. */
  autoConfirmHours: number;
  /** Hours after release during which a client may still raise an issue. */
  disputeWindowHours: number;
  /** Hours the trust team has to resolve a dispute (target, shown to admins). */
  disputeSlaHours: number;
  /** Automatic deposits on/off. Off = every payout needs an admin release. */
  autoReleaseEnabled: boolean;
  /* ------------------------------------------------------------------ gifts */
  /** Members may send cash gifts in chat. */
  tipsEnabled: boolean;
  /** Commission taken from a gift, in percent. */
  tipFeePct: number;
  /** Route gifts through escrow too, instead of paying out instantly. */
  tipsEscrowed: boolean;
  /** Largest single gift a member may send, in GHS. */
  maxTip: number;
}

export const DEFAULT_ESCROW_SETTINGS: EscrowSettings = {
  escrowEnabled: true,
  holdHours: 24,
  requireClientConfirm: true,
  autoConfirmHours: 72,
  disputeWindowHours: 48,
  disputeSlaHours: 24,
  autoReleaseEnabled: true,
  tipsEnabled: true,
  tipFeePct: 8,
  tipsEscrowed: false,
  maxTip: 1000,
};

/* ----------------------------------------------------------------- entries */

export type EscrowState = Database["public"]["Enums"]["escrow_state"];
export type EscrowKind = Database["public"]["Enums"]["escrow_kind"];

/** A row from `escrow_entries`. Field names match the database directly. */
export type EscrowEntry = EscrowRow;

export const ESCROW_STATE_LABEL: Record<EscrowState, string> = {
  pending: "Pending — payment not yet confirmed",
  held: "Held — awaiting confirmation",
  clearing: "Clearing — auto-deposit scheduled",
  released: "Released to specialist",
  disputed: "Frozen — issue raised",
  refunded: "Refunded to member",
};

/* ------------------------------------------------------------------ helpers */

export function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

/** "in 4h 20m" / "any moment now" / "3d 2h ago" */
export function relativeTime(iso: string | null) {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  const ahead = diff > 0;
  const minutes = Math.floor(Math.abs(diff) / 60_000);
  if (minutes < 1) return ahead ? "any moment now" : "just now";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts = days
    ? [`${days}d`, hours ? `${hours}h` : ""]
    : hours
      ? [`${hours}h`, mins ? `${mins}m` : ""]
      : [`${mins}m`];
  const label = parts.filter(Boolean).join(" ");
  return ahead ? `in ${label}` : `${label} ago`;
}

export function escrowSplit(amount: number, feePct: number) {
  const fee = Math.round(amount * (feePct / 100));
  return { amount, fee, net: amount - fee };
}

/** Pure selector: entries whose hold window has passed but haven't settled. */
export function dueForRelease(entries: EscrowEntry[], now = Date.now()): EscrowEntry[] {
  return entries.filter(
    (entry) =>
      (entry.state === "held" || entry.state === "clearing") &&
      entry.release_at !== null &&
      new Date(entry.release_at).getTime() <= now,
  );
}

/* ------------------------------------------------------------------ context */

export interface NewEscrowInput {
  kind: EscrowKind;
  threadId?: string | null;
  bookingId?: string | null;
  specialistId: string;
  label: string;
  /** What the client paid, in GHS. */
  amount: number;
  /** Platform commission, in percent. */
  feePct: number;
  giftKey?: string | null;
  paystackReference?: string | null;
}

interface EscrowContextValue {
  settings: EscrowSettings;
  settingsReady: boolean;
  entries: EscrowEntry[];
  entriesLoading: boolean;
  /** Escrow rows for a chat thread, newest first. */
  threadEntries: (threadId: string) => EscrowEntry[];
  open: (input: NewEscrowInput) => Promise<EscrowEntry>;
  confirmComplete: (id: string) => Promise<void>;
  raiseIssue: (id: string, reason: string) => Promise<void>;
  releaseNow: (id: string, note?: string) => Promise<void>;
  refund: (id: string, note?: string) => Promise<void>;
  resolveDispute: (id: string, outcome: "release" | "refund", note: string) => Promise<void>;
  setSetting: <K extends keyof EscrowSettings>(key: K, value: EscrowSettings[K]) => Promise<void>;
  resetSettings: () => Promise<void>;
  totals: {
    held: number;
    clearing: number;
    released: number;
    disputed: number;
    refunded: number;
    fees: number;
    gifts: number;
  };
}

const EscrowContext = createContext<null>(null);

/**
 * Historically an app-wide provider backed by localStorage. All escrow state
 * now lives in Postgres and is read via TanStack Query + realtime, so this is
 * kept only as a no-op passthrough — `src/routes/__root.tsx` still wraps the
 * tree in it, and removing the export would break that file.
 */
export function EscrowProvider({ children }: { children: ReactNode }) {
  return <EscrowContext.Provider value={null}>{children}</EscrowContext.Provider>;
}

export function useEscrow(): EscrowContextValue {
  const { user } = useAuth();
  const { value: settings, save: saveSettings, ready: settingsReady } = useSettingsSection(
    "escrow",
    DEFAULT_ESCROW_SETTINGS,
  );
  const entriesQuery = useEscrowEntries();
  const { create, update } = useEscrowMutations();
  const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data]);
  const queryClient = useQueryClient();
  const confirmEscrow = useServerFn(confirmEscrowComplete);
  const raiseIssueFn = useServerFn(raiseEscrowIssue);
  const refreshEntries = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["escrow"] }),
    [queryClient],
  );


  // Settlement is performed server-side by the scheduled pass at
  // /api/public/hooks/escrow-release — no browser is involved in moving money.


  const threadEntries = useCallback(
    (threadId: string) => entries.filter((entry) => entry.thread_id === threadId),
    [entries],
  );

  const open = useCallback<EscrowContextValue["open"]>(
    async (input) => {
      if (!user) throw new Error("Sign in required to move money into escrow.");
      const { amount, fee, net } = escrowSplit(input.amount, input.feePct);
      const escrowed =
        settings.escrowEnabled && (input.kind === "booking" || settings.tipsEscrowed);
      const now = new Date().toISOString();

      const insert: Database["public"]["Tables"]["escrow_entries"]["Insert"] = {
        kind: input.kind,
        thread_id: input.threadId ?? null,
        booking_id: input.bookingId ?? null,
        client_id: user.id,
        specialist_id: input.specialistId,
        label: input.label,
        gift_key: input.giftKey ?? null,
        amount,
        platform_fee: fee,
        payout_amount: net,
        hold_hours: settings.holdHours,
        paystack_reference: input.paystackReference ?? null,
        paid_at: now,
        state: "held",
        release_at: null,
      };

      if (!escrowed) {
        insert.state = "released";
        insert.released_at = now;
        insert.admin_note = "Paid straight through — escrow not applied to this payment type.";
      } else if (!settings.requireClientConfirm) {
        insert.state = "clearing";
        insert.release_at = hoursFromNow(settings.holdHours);
      }

      try {
        return await create.mutateAsync(insert);
      } catch (error) {
        toast.error("Payment couldn't be secured in escrow", {
          description: error instanceof Error ? error.message : "Please try again.",
        });
        throw error;
      }
    },
    [create, settings, user],
  );

  const runUpdate = useCallback(
    async (id: string, patch: Database["public"]["Tables"]["escrow_entries"]["Update"], failureMessage: string) => {
      try {
        await update.mutateAsync({ id, patch });
      } catch (error) {
        toast.error(failureMessage, {
          description: error instanceof Error ? error.message : "Please try again.",
        });
        throw error;
      }
    },
    [update],
  );

  // Member-side transitions run through secure server actions: the database no
  // longer lets a member or specialist edit an escrow row directly.
  const confirmComplete = useCallback<EscrowContextValue["confirmComplete"]>(
    async (id) => {
      try {
        await confirmEscrow({ data: { escrowId: id } });
        await refreshEntries();
      } catch (error) {
        toast.error("Couldn't confirm the visit", {
          description: error instanceof Error ? error.message : "Please try again.",
        });
        throw error;
      }
    },
    [confirmEscrow, refreshEntries],
  );

  const raiseIssue = useCallback<EscrowContextValue["raiseIssue"]>(
    async (id, reason) => {
      try {
        await raiseIssueFn({ data: { escrowId: id, reason } });
        await refreshEntries();
      } catch (error) {
        toast.error("Couldn't raise the issue", {
          description: error instanceof Error ? error.message : "Please try again.",
        });
        throw error;
      }
    },
    [raiseIssueFn, refreshEntries],
  );


  const releaseNow = useCallback<EscrowContextValue["releaseNow"]>(
    (id, note) =>
      runUpdate(
        id,
        {
          state: "released",
          release_at: null,
          released_at: new Date().toISOString(),
          admin_note: note ?? "Released manually by an admin.",
        },
        "Couldn't release the payout",
      ),
    [runUpdate],
  );

  const refund = useCallback<EscrowContextValue["refund"]>(
    (id, note) =>
      runUpdate(
        id,
        {
          state: "refunded",
          release_at: null,
          released_at: null,
          admin_note: note ?? "Refunded to the member by an admin.",
        },
        "Couldn't process the refund",
      ),
    [runUpdate],
  );

  const resolveDispute = useCallback<EscrowContextValue["resolveDispute"]>(
    async (id, outcome, note) => {
      if (outcome === "release") await releaseNow(id, note || "Dispute closed — payout approved.");
      else await refund(id, note || "Dispute upheld — member refunded.");
    },
    [releaseNow, refund],
  );

  const setSetting = useCallback<EscrowContextValue["setSetting"]>(
    async (key, value) => {
      try {
        await saveSettings({ ...settings, [key]: value });
      } catch (error) {
        toast.error("Couldn't save escrow settings", {
          description: error instanceof Error ? error.message : "Please try again.",
        });
        throw error;
      }
    },
    [saveSettings, settings],
  );

  const resetSettings = useCallback(async () => {
    try {
      await saveSettings(DEFAULT_ESCROW_SETTINGS);
    } catch (error) {
      toast.error("Couldn't reset escrow settings", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
      throw error;
    }
  }, [saveSettings]);

  const totals = useMemo(() => {
    const sum = (predicate: (entry: EscrowEntry) => boolean, pick: (entry: EscrowEntry) => number) =>
      entries.filter(predicate).reduce((total, entry) => total + pick(entry), 0);

    return {
      held: sum((entry) => entry.state === "held", (entry) => entry.amount),
      clearing: sum((entry) => entry.state === "clearing", (entry) => entry.amount),
      released: sum((entry) => entry.state === "released", (entry) => entry.payout_amount),
      disputed: sum((entry) => entry.state === "disputed", (entry) => entry.amount),
      refunded: sum((entry) => entry.state === "refunded", (entry) => entry.amount),
      fees: sum((entry) => entry.state === "released", (entry) => entry.platform_fee),
      gifts: sum((entry) => entry.kind === "gift", (entry) => entry.amount),
    };
  }, [entries]);

  return {
    settings,
    settingsReady,
    entries,
    entriesLoading: entriesQuery.isLoading,
    threadEntries,
    open,
    confirmComplete,
    raiseIssue,
    releaseNow,
    refund,
    resolveDispute,
    setSetting,
    resetSettings,
    totals,
  };
}
