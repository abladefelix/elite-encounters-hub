import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { CURRENT_CLIENT_ID } from "./mock-data";

/**
 * Escrow engine.
 *
 * Every booking payment and every cash tip lands in escrow instead of going
 * straight to the specialist. Money moves through a small state machine:
 *
 *   held ──(client confirms the job)──▶ clearing ──(hold window elapses)──▶ released
 *     │                                   │
 *     └──────(client raises an issue)─────┴──▶ disputed ──▶ released | refunded
 *
 * The clearing → released step runs automatically on a ticker, so payouts
 * settle without anyone touching them — but every knob (hold window, dispute
 * window, whether confirmation is required, whether tips are escrowed) lives in
 * the admin portal, and admins can always release, refund or freeze by hand.
 *
 * Persisted in localStorage today; swap `read`/`write` for backend calls later.
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
  /* ------------------------------------------------------------------ tips */
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

export type EscrowState = "held" | "clearing" | "released" | "disputed" | "refunded";

export type EscrowKind = "booking" | "tip";

export interface EscrowEntry {
  id: string;
  /** Paystack transaction reference. */
  reference: string;
  kind: EscrowKind;
  threadId: string;
  clientId: string;
  specialistId: string;
  specialistName: string;
  label: string;
  /** What the client paid, in GHS. */
  gross: number;
  /** Platform commission withheld from the payout. */
  fee: number;
  /** What the specialist receives on release. */
  net: number;
  createdAt: string;
  /** When the automatic deposit fires. Null while awaiting confirmation. */
  clearingAt: string | null;
  releasedAt: string | null;
  state: EscrowState;
  /** Dispute reason or admin resolution note. */
  note: string;
}

export const ESCROW_STATE_LABEL: Record<EscrowState, string> = {
  held: "Held — awaiting confirmation",
  clearing: "Clearing — auto-deposit scheduled",
  released: "Released to specialist",
  disputed: "Frozen — issue raised",
  refunded: "Refunded to member",
};

/* ------------------------------------------------------------------ storage */

export const ESCROW_STORAGE_KEY = "ashnight-escrow-v1";
export const ESCROW_EVENT = "ashnight-escrow-change";

interface StoredEscrow {
  settings: EscrowSettings;
  entries: EscrowEntry[];
}

function clampNumber(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function sanitizeSettings(value: unknown): EscrowSettings {
  const next = { ...DEFAULT_ESCROW_SETTINGS };
  if (!value || typeof value !== "object") return next;
  const record = value as Record<string, unknown>;
  for (const key of [
    "escrowEnabled",
    "requireClientConfirm",
    "autoReleaseEnabled",
    "tipsEnabled",
    "tipsEscrowed",
  ] as const) {
    if (typeof record[key] === "boolean") next[key] = record[key] as boolean;
  }
  next.holdHours = clampNumber(record["holdHours"], next.holdHours, 0, 720);
  next.autoConfirmHours = clampNumber(record["autoConfirmHours"], next.autoConfirmHours, 1, 720);
  next.disputeWindowHours = clampNumber(
    record["disputeWindowHours"],
    next.disputeWindowHours,
    0,
    720,
  );
  next.disputeSlaHours = clampNumber(record["disputeSlaHours"], next.disputeSlaHours, 1, 720);
  next.tipFeePct = clampNumber(record["tipFeePct"], next.tipFeePct, 0, 50);
  next.maxTip = clampNumber(record["maxTip"], next.maxTip, 1, 100000);
  return next;
}

const STATES: EscrowState[] = ["held", "clearing", "released", "disputed", "refunded"];

function sanitizeEntry(value: unknown): EscrowEntry | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record["id"] === "string" ? record["id"] : null;
  if (!id) return null;
  const state = STATES.includes(record["state"] as EscrowState)
    ? (record["state"] as EscrowState)
    : "held";
  return {
    id,
    reference: typeof record["reference"] === "string" ? record["reference"] : id,
    kind: record["kind"] === "tip" ? "tip" : "booking",
    threadId: typeof record["threadId"] === "string" ? record["threadId"] : "",
    clientId: typeof record["clientId"] === "string" ? record["clientId"] : CURRENT_CLIENT_ID,
    specialistId: typeof record["specialistId"] === "string" ? record["specialistId"] : "",
    specialistName:
      typeof record["specialistName"] === "string" ? record["specialistName"] : "Specialist",
    label: typeof record["label"] === "string" ? record["label"] : "Booking",
    gross: clampNumber(record["gross"], 0),
    fee: clampNumber(record["fee"], 0),
    net: clampNumber(record["net"], 0),
    createdAt:
      typeof record["createdAt"] === "string" ? record["createdAt"] : new Date().toISOString(),
    clearingAt: typeof record["clearingAt"] === "string" ? record["clearingAt"] : null,
    releasedAt: typeof record["releasedAt"] === "string" ? record["releasedAt"] : null,
    state,
    note: typeof record["note"] === "string" ? record["note"] : "",
  };
}

function sanitizeState(value: unknown): StoredEscrow {
  const record = (value ?? {}) as Record<string, unknown>;
  const list = Array.isArray(record["entries"]) ? (record["entries"] as unknown[]) : [];
  return {
    settings: sanitizeSettings(record["settings"]),
    entries: list.map(sanitizeEntry).filter((entry): entry is EscrowEntry => entry !== null),
  };
}

const DEFAULT_STATE: StoredEscrow = { settings: DEFAULT_ESCROW_SETTINGS, entries: [] };

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

export function escrowSplit(gross: number, feePct: number) {
  const fee = Math.round(gross * (feePct / 100));
  return { gross, fee, net: gross - fee };
}

/* ------------------------------------------------------------------ context */

export interface NewEscrow {
  kind: EscrowKind;
  threadId: string;
  specialistId: string;
  specialistName: string;
  label: string;
  gross: number;
  feePct: number;
  reference: string;
}

interface EscrowContextValue {
  settings: EscrowSettings;
  entries: EscrowEntry[];
  /** Escrow rows for a chat thread, newest first. */
  threadEntries: (threadId: string) => EscrowEntry[];
  open: (input: NewEscrow) => EscrowEntry;
  confirmComplete: (id: string) => void;
  raiseIssue: (id: string, reason: string) => void;
  releaseNow: (id: string, note?: string) => void;
  refund: (id: string, note?: string) => void;
  resolveDispute: (id: string, outcome: "release" | "refund", note: string) => void;
  setSetting: <K extends keyof EscrowSettings>(key: K, value: EscrowSettings[K]) => void;
  resetSettings: () => void;
  clearLedger: () => void;
  totals: {
    held: number;
    clearing: number;
    released: number;
    disputed: number;
    refunded: number;
    fees: number;
    tips: number;
  };
}

const EscrowContext = createContext<EscrowContextValue | null>(null);

/** Apply the automatic clearing → released step. Returns null if nothing moved. */
function advance(entries: EscrowEntry[], settings: EscrowSettings): EscrowEntry[] | null {
  const now = Date.now();
  let changed = false;
  const next = entries.map((entry) => {
    // Nothing to do once money has landed or been sent back.
    if (entry.state === "released" || entry.state === "refunded" || entry.state === "disputed") {
      return entry;
    }
    // No confirmation in time: start the clearing window anyway.
    if (entry.state === "held") {
      const deadline = new Date(entry.createdAt).getTime() + settings.autoConfirmHours * 3600_000;
      if (now >= deadline) {
        changed = true;
        return { ...entry, state: "clearing" as EscrowState, clearingAt: hoursFromNow(settings.holdHours) };
      }
      return entry;
    }
    if (
      entry.state === "clearing" &&
      settings.autoReleaseEnabled &&
      entry.clearingAt &&
      now >= new Date(entry.clearingAt).getTime()
    ) {
      changed = true;
      return {
        ...entry,
        state: "released" as EscrowState,
        releasedAt: new Date().toISOString(),
        note: entry.note || "Auto-deposited — hold window elapsed with no issues raised.",
      };
    }
    return entry;
  });
  return changed ? next : null;
}

export function EscrowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoredEscrow>(DEFAULT_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const write = useCallback((next: StoredEscrow) => {
    stateRef.current = next;
    setState(next);
    try {
      window.localStorage.setItem(ESCROW_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent(ESCROW_EVENT));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const commit = useCallback(
    (updater: (current: StoredEscrow) => StoredEscrow) => {
      write(updater(stateRef.current));
    },
    [write],
  );

  // Hydrate after mount so SSR and first client render match.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ESCROW_STORAGE_KEY);
      if (raw) setState(sanitizeState(JSON.parse(raw)));
    } catch {
      /* ignore malformed storage */
    }

    function onStorage(event: StorageEvent) {
      if (event.key !== ESCROW_STORAGE_KEY) return;
      try {
        setState(event.newValue ? sanitizeState(JSON.parse(event.newValue)) : DEFAULT_STATE);
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // The automation: a ticker that settles anything whose window has elapsed.
  useEffect(() => {
    function tick() {
      const current = stateRef.current;
      const next = advance(current.entries, current.settings);
      if (next) write({ ...current, entries: next });
    }
    tick();
    const timer = setInterval(tick, 15_000);
    return () => clearInterval(timer);
  }, [write]);

  const open = useCallback<EscrowContextValue["open"]>(
    (input) => {
      const current = stateRef.current;
      const { settings } = current;
      const { gross, fee, net } = escrowSplit(input.gross, input.feePct);
      const escrowed =
        settings.escrowEnabled && (input.kind === "booking" || settings.tipsEscrowed);
      const now = new Date().toISOString();

      const entry: EscrowEntry = {
        id: `esc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        reference: input.reference,
        kind: input.kind,
        threadId: input.threadId,
        clientId: CURRENT_CLIENT_ID,
        specialistId: input.specialistId,
        specialistName: input.specialistName,
        label: input.label,
        gross,
        fee,
        net,
        createdAt: now,
        clearingAt: null,
        releasedAt: null,
        state: "held",
        note: "",
      };

      if (!escrowed) {
        entry.state = "released";
        entry.releasedAt = now;
        entry.note = "Paid straight through — escrow not applied to this payment type.";
      } else if (!settings.requireClientConfirm) {
        entry.state = "clearing";
        entry.clearingAt = hoursFromNow(settings.holdHours);
      }

      commit((value) => ({ ...value, entries: [entry, ...value.entries] }));
      return entry;
    },
    [commit],
  );

  const mutate = useCallback(
    (id: string, changes: (entry: EscrowEntry) => EscrowEntry) => {
      commit((current) => ({
        ...current,
        entries: current.entries.map((entry) => (entry.id === id ? changes(entry) : entry)),
      }));
    },
    [commit],
  );

  const confirmComplete = useCallback<EscrowContextValue["confirmComplete"]>(
    (id) => {
      const hold = stateRef.current.settings.holdHours;
      mutate(id, (entry) =>
        entry.state === "held"
          ? {
              ...entry,
              state: "clearing",
              clearingAt: hoursFromNow(hold),
              note: "Member confirmed the visit — clearing window started.",
            }
          : entry,
      );
    },
    [mutate],
  );

  const raiseIssue = useCallback<EscrowContextValue["raiseIssue"]>(
    (id, reason) => {
      mutate(id, (entry) =>
        entry.state === "held" || entry.state === "clearing"
          ? { ...entry, state: "disputed", clearingAt: null, note: reason }
          : entry,
      );
    },
    [mutate],
  );

  const releaseNow = useCallback<EscrowContextValue["releaseNow"]>(
    (id, note) => {
      mutate(id, (entry) => ({
        ...entry,
        state: "released",
        clearingAt: null,
        releasedAt: new Date().toISOString(),
        note: note ?? "Released manually by an admin.",
      }));
    },
    [mutate],
  );

  const refund = useCallback<EscrowContextValue["refund"]>(
    (id, note) => {
      mutate(id, (entry) => ({
        ...entry,
        state: "refunded",
        clearingAt: null,
        releasedAt: null,
        note: note ?? "Refunded to the member by an admin.",
      }));
    },
    [mutate],
  );

  const resolveDispute = useCallback<EscrowContextValue["resolveDispute"]>(
    (id, outcome, note) => {
      if (outcome === "release") releaseNow(id, note || "Dispute closed — payout approved.");
      else refund(id, note || "Dispute upheld — member refunded.");
    },
    [releaseNow, refund],
  );

  const setSetting = useCallback<EscrowContextValue["setSetting"]>(
    (key, value) => {
      commit((current) => ({ ...current, settings: { ...current.settings, [key]: value } }));
    },
    [commit],
  );

  const resetSettings = useCallback(() => {
    commit((current) => ({ ...current, settings: DEFAULT_ESCROW_SETTINGS }));
  }, [commit]);

  const clearLedger = useCallback(() => {
    commit((current) => ({ ...current, entries: [] }));
  }, [commit]);

  const value = useMemo<EscrowContextValue>(() => {
    const sum = (predicate: (entry: EscrowEntry) => boolean, pick: (entry: EscrowEntry) => number) =>
      state.entries.filter(predicate).reduce((total, entry) => total + pick(entry), 0);

    return {
      settings: state.settings,
      entries: state.entries,
      threadEntries: (threadId) => state.entries.filter((entry) => entry.threadId === threadId),
      open,
      confirmComplete,
      raiseIssue,
      releaseNow,
      refund,
      resolveDispute,
      setSetting,
      resetSettings,
      clearLedger,
      totals: {
        held: sum((entry) => entry.state === "held", (entry) => entry.gross),
        clearing: sum((entry) => entry.state === "clearing", (entry) => entry.gross),
        released: sum((entry) => entry.state === "released", (entry) => entry.net),
        disputed: sum((entry) => entry.state === "disputed", (entry) => entry.gross),
        refunded: sum((entry) => entry.state === "refunded", (entry) => entry.gross),
        fees: sum((entry) => entry.state === "released", (entry) => entry.fee),
        tips: sum((entry) => entry.kind === "tip", (entry) => entry.gross),
      },
    };
  }, [
    state,
    open,
    confirmComplete,
    raiseIssue,
    releaseNow,
    refund,
    resolveDispute,
    setSetting,
    resetSettings,
    clearLedger,
  ]);

  return <EscrowContext.Provider value={value}>{children}</EscrowContext.Provider>;
}

export function useEscrow() {
  const context = useContext(EscrowContext);
  if (!context) throw new Error("useEscrow must be used inside <EscrowProvider>");
  return context;
}
