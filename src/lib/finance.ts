/**
 * Ashnight finance & accounting layer.
 *
 * Real double-entry bookkeeping on top of the operational tables:
 *
 *   ledger_accounts     chart of accounts (assets, liabilities, equity, revenue, expenses)
 *   journal_entries     a balanced transaction (header)
 *   journal_lines       its debit / credit lines
 *   expenses            business costs, each posted to the journal
 *   accounting_periods  monthly books that can be locked after reporting
 *
 * Everything an accountant expects is derived from posted journal lines:
 * general ledger, trial balance, income statement, balance sheet, cash flow
 * and a Ghana VAT/levy summary. Nothing is simulated — reports are a pure
 * function of the rows in the database.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];
export type LedgerAccount = Tables["ledger_accounts"]["Row"];
export type JournalEntryRow = Tables["journal_entries"]["Row"];
export type JournalLineRow = Tables["journal_lines"]["Row"];
export type ExpenseRow = Tables["expenses"]["Row"];
export type AccountingPeriodRow = Tables["accounting_periods"]["Row"];
export type AccountType = Database["public"]["Enums"]["account_type"];
export type JournalStatus = Database["public"]["Enums"]["journal_status"];

export interface JournalEntry extends JournalEntryRow {
  lines: (JournalLineRow & { account: LedgerAccount | null })[];
}

/* ------------------------------------------------------------------ helpers */

export const ACCOUNT_TYPES: AccountType[] = [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
];

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expenses",
};

/** Debit-positive account types. Credit types are liability, equity, revenue. */
export function isDebitAccount(type: AccountType) {
  return type === "asset" || type === "expense";
}

/** Two-decimal accounting currency, e.g. "GHS 1,240.50". */
export function cedis(amount: number) {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function round2(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function periodOf(date: string | Date) {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function periodLabel(period: string) {
  const [year, month] = period.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("en-GH", { month: "long", year: "numeric" });
}

export function entryNumber(date: string) {
  const stamp = date.replaceAll("-", "");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `JE-${stamp}-${suffix}`;
}

/** Sum of debits and credits for an entry plus whether it balances. */
export function entryTotals(lines: { debit: number | string; credit: number | string }[]) {
  const debit = round2(lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
  const credit = round2(lines.reduce((sum, line) => sum + Number(line.credit || 0), 0));
  return { debit, credit, balanced: debit === credit && debit > 0 };
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as T;
}

/* ------------------------------------------------------- chart of accounts */

const ACCOUNTS_KEY = ["finance", "accounts"];
const JOURNAL_KEY = ["finance", "journal"];
const EXPENSES_KEY = ["finance", "expenses"];
const PERIODS_KEY = ["finance", "periods"];

export function useLedgerAccounts() {
  return useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: async () =>
      unwrap<LedgerAccount[]>(
        await supabase.from("ledger_accounts").select("*").order("code", { ascending: true }),
      ),
  });
}

export function useAccountMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["finance"] });

  const create = useMutation({
    mutationFn: async (input: Tables["ledger_accounts"]["Insert"]) => {
      const { error } = await supabase.from("ledger_accounts").insert(input);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Tables["ledger_accounts"]["Update"] }) => {
      const { error } = await supabase.from("ledger_accounts").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ledger_accounts").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

/* --------------------------------------------------------------- the journal */

export function useJournal(range?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: [...JOURNAL_KEY, range?.from ?? "", range?.to ?? ""],
    queryFn: async () => {
      let query = supabase
        .from("journal_entries")
        .select("*, lines:journal_lines(*, account:ledger_accounts(*))")
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (range?.from) query = query.gte("entry_date", range.from);
      if (range?.to) query = query.lte("entry_date", range.to);
      const rows = unwrap<JournalEntry[]>(await query);
      return rows.map((row) => ({
        ...row,
        lines: [...(row.lines ?? [])].sort((a, b) => a.line_no - b.line_no),
      }));
    },
  });
}

export interface DraftLine {
  accountId: string;
  debit: number;
  credit: number;
  description: string;
}

export interface DraftEntry {
  entryDate: string;
  memo: string;
  reference: string;
  status: JournalStatus;
  lines: DraftLine[];
}

export function useJournalMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["finance"] });

  const post = useMutation({
    mutationFn: async (draft: DraftEntry) => {
      const lines = draft.lines.filter(
        (line) => line.accountId && (Number(line.debit) > 0 || Number(line.credit) > 0),
      );
      if (lines.length < 2) throw new Error("A journal entry needs at least two lines.");
      const totals = entryTotals(lines);
      if (!totals.balanced) {
        throw new Error(
          `Entry does not balance — debits ${cedis(totals.debit)} vs credits ${cedis(totals.credit)}.`,
        );
      }

      const period = periodOf(draft.entryDate);
      const { data: periodRow } = await supabase
        .from("accounting_periods")
        .select("status")
        .eq("period", period)
        .maybeSingle();
      if (periodRow?.status === "closed") {
        throw new Error(`${periodLabel(period)} is closed. Reopen the period to post into it.`);
      }

      const { data: user } = await supabase.auth.getUser();
      const { data: entry, error } = await supabase
        .from("journal_entries")
        .insert({
          entry_no: entryNumber(draft.entryDate),
          entry_date: draft.entryDate,
          period,
          memo: draft.memo,
          reference: draft.reference,
          source: "manual",
          status: draft.status,
          created_by: user.user?.id ?? null,
          posted_at: draft.status === "posted" ? new Date().toISOString() : null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      const { error: linesError } = await supabase.from("journal_lines").insert(
        lines.map((line, index) => ({
          entry_id: entry.id,
          account_id: line.accountId,
          debit: round2(Number(line.debit) || 0),
          credit: round2(Number(line.credit) || 0),
          description: line.description,
          line_no: index + 1,
        })),
      );
      if (linesError) {
        await supabase.from("journal_entries").delete().eq("id", entry.id);
        throw new Error(linesError.message);
      }
      return entry.id;
    },
    onSuccess: invalidate,
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: JournalStatus }) => {
      const { error } = await supabase
        .from("journal_entries")
        .update({
          status,
          posted_at: status === "posted" ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("journal_entries").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  return { post, setStatus, remove };
}

/* ------------------------------------------------------------------ expenses */

export const EXPENSE_CATEGORIES = [
  "marketing",
  "payroll",
  "hosting",
  "trust-and-safety",
  "bank-charges",
  "processing-fees",
  "general",
] as const;

export const PAYMENT_METHODS = ["bank", "momo", "card", "cash", "payable"] as const;

export function useExpenses() {
  return useQuery({
    queryKey: EXPENSES_KEY,
    queryFn: async () =>
      unwrap<ExpenseRow[]>(
        await supabase.from("expenses").select("*").order("expense_date", { ascending: false }),
      ),
  });
}

export interface DraftExpense {
  expenseDate: string;
  vendor: string;
  category: string;
  accountId: string;
  amount: number;
  taxAmount: number;
  paymentMethod: string;
  reference: string;
  memo: string;
  status: "recorded" | "paid";
  /** Account the money left from — cash/bank/MoMo, or accounts payable. */
  fundingAccountId: string;
}

export function useExpenseMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["finance"] });

  const create = useMutation({
    mutationFn: async (draft: DraftExpense) => {
      const amount = round2(Number(draft.amount) || 0);
      const tax = round2(Number(draft.taxAmount) || 0);
      if (amount <= 0) throw new Error("Enter an expense amount greater than zero.");
      if (!draft.accountId) throw new Error("Choose the expense account to charge.");
      if (!draft.fundingAccountId) throw new Error("Choose how the expense was funded.");

      const { data: user } = await supabase.auth.getUser();
      const period = periodOf(draft.expenseDate);
      const { data: periodRow } = await supabase
        .from("accounting_periods")
        .select("status")
        .eq("period", period)
        .maybeSingle();
      if (periodRow?.status === "closed") {
        throw new Error(`${periodLabel(period)} is closed. Reopen the period first.`);
      }

      const { data: entry, error: entryError } = await supabase
        .from("journal_entries")
        .insert({
          entry_no: entryNumber(draft.expenseDate),
          entry_date: draft.expenseDate,
          period,
          memo: draft.memo || `Expense — ${draft.vendor || draft.category}`,
          reference: draft.reference,
          source: "expense",
          status: "posted",
          created_by: user.user?.id ?? null,
          posted_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (entryError) throw new Error(entryError.message);

      const lines: Tables["journal_lines"]["Insert"][] = [
        {
          entry_id: entry.id,
          account_id: draft.accountId,
          debit: amount,
          credit: 0,
          description: draft.vendor || draft.category,
          line_no: 1,
        },
      ];
      if (tax > 0) {
        // Recoverable input VAT sits with the tax liability account.
        const { data: vat } = await supabase
          .from("ledger_accounts")
          .select("id")
          .eq("code", "2200")
          .maybeSingle();
        if (vat) {
          lines.push({
            entry_id: entry.id,
            account_id: vat.id,
            debit: tax,
            credit: 0,
            description: "Input VAT",
            line_no: 2,
          });
        }
      }
      lines.push({
        entry_id: entry.id,
        account_id: draft.fundingAccountId,
        debit: 0,
        credit: round2(amount + (tax > 0 ? tax : 0)),
        description: `Paid by ${draft.paymentMethod}`,
        line_no: lines.length + 1,
      });

      const { error: linesError } = await supabase.from("journal_lines").insert(lines);
      if (linesError) {
        await supabase.from("journal_entries").delete().eq("id", entry.id);
        throw new Error(linesError.message);
      }

      const { error } = await supabase.from("expenses").insert({
        expense_date: draft.expenseDate,
        vendor: draft.vendor,
        category: draft.category,
        account_id: draft.accountId,
        amount,
        tax_amount: tax,
        payment_method: draft.paymentMethod,
        reference: draft.reference,
        memo: draft.memo,
        status: draft.status,
        entry_id: entry.id,
        created_by: user.user?.id ?? null,
      });
      if (error) {
        await supabase.from("journal_entries").delete().eq("id", entry.id);
        throw new Error(error.message);
      }
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Tables["expenses"]["Update"] }) => {
      const { error } = await supabase.from("expenses").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (row: ExpenseRow) => {
      const { error } = await supabase.from("expenses").delete().eq("id", row.id);
      if (error) throw new Error(error.message);
      if (row.entry_id) {
        await supabase.from("journal_entries").delete().eq("id", row.entry_id);
      }
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

/* ------------------------------------------------------------------- periods */

export function useAccountingPeriods() {
  return useQuery({
    queryKey: PERIODS_KEY,
    queryFn: async () =>
      unwrap<AccountingPeriodRow[]>(
        await supabase.from("accounting_periods").select("*").order("period", { ascending: false }),
      ),
  });
}

export function usePeriodMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["finance"] });

  const upsert = useMutation({
    mutationFn: async ({
      period,
      status,
      note,
    }: {
      period: string;
      status: "open" | "closed";
      note?: string;
    }) => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("accounting_periods").upsert(
        {
          period,
          status,
          note: note ?? "",
          closed_by: status === "closed" ? (user.user?.id ?? null) : null,
          closed_at: status === "closed" ? new Date().toISOString() : null,
        },
        { onConflict: "period" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  return { upsert };
}

/* ------------------------------------------------------------------- reports */

export interface AccountBalance {
  account: LedgerAccount;
  debit: number;
  credit: number;
  /** Signed balance in the account's normal direction. */
  balance: number;
}

/** Posted lines only — drafts and voided entries never touch the reports. */
export function postedLines(entries: JournalEntry[], range?: { from?: string; to?: string }) {
  return entries
    .filter((entry) => entry.status === "posted")
    .filter((entry) => (range?.from ? entry.entry_date >= range.from : true))
    .filter((entry) => (range?.to ? entry.entry_date <= range.to : true))
    .flatMap((entry) =>
      entry.lines.map((line) => ({
        ...line,
        entry_date: entry.entry_date,
        entry_no: entry.entry_no,
        memo: entry.memo,
        source: entry.source,
      })),
    );
}

export function trialBalance(
  entries: JournalEntry[],
  accounts: LedgerAccount[],
  range?: { from?: string; to?: string },
): { rows: AccountBalance[]; debit: number; credit: number; balanced: boolean } {
  const lines = postedLines(entries, range);
  const byAccount = new Map<string, { debit: number; credit: number }>();
  for (const line of lines) {
    const bucket = byAccount.get(line.account_id) ?? { debit: 0, credit: 0 };
    bucket.debit += Number(line.debit || 0);
    bucket.credit += Number(line.credit || 0);
    byAccount.set(line.account_id, bucket);
  }

  const rows: AccountBalance[] = accounts
    .map((account) => {
      const bucket = byAccount.get(account.id) ?? { debit: 0, credit: 0 };
      const raw = bucket.debit - bucket.credit;
      return {
        account,
        debit: round2(bucket.debit),
        credit: round2(bucket.credit),
        balance: round2(isDebitAccount(account.type) ? raw : -raw),
      };
    })
    .filter((row) => row.debit !== 0 || row.credit !== 0);

  const debit = round2(rows.reduce((sum, row) => sum + row.debit, 0));
  const credit = round2(rows.reduce((sum, row) => sum + row.credit, 0));
  return { rows, debit, credit, balanced: debit === credit };
}

export interface IncomeStatement {
  revenue: AccountBalance[];
  expenses: AccountBalance[];
  totalRevenue: number;
  totalExpenses: number;
  grossProfit: number;
  netProfit: number;
  margin: number;
}

export function incomeStatement(
  entries: JournalEntry[],
  accounts: LedgerAccount[],
  range?: { from?: string; to?: string },
): IncomeStatement {
  const { rows } = trialBalance(entries, accounts, range);
  const revenue = rows.filter((row) => row.account.type === "revenue");
  const expenses = rows.filter((row) => row.account.type === "expense");
  const totalRevenue = round2(revenue.reduce((sum, row) => sum + row.balance, 0));
  const totalExpenses = round2(expenses.reduce((sum, row) => sum + row.balance, 0));
  const cogs = round2(
    expenses
      .filter((row) => row.account.subtype === "cogs")
      .reduce((sum, row) => sum + row.balance, 0),
  );
  const netProfit = round2(totalRevenue - totalExpenses);
  return {
    revenue,
    expenses,
    totalRevenue,
    totalExpenses,
    grossProfit: round2(totalRevenue - cogs),
    netProfit,
    margin: totalRevenue ? round2((netProfit / totalRevenue) * 100) : 0,
  };
}

export interface BalanceSheet {
  assets: AccountBalance[];
  liabilities: AccountBalance[];
  equity: AccountBalance[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  retainedEarnings: number;
  balanced: boolean;
}

/** Cumulative position as at `asAt` (inclusive), with period profit rolled into equity. */
export function balanceSheet(
  entries: JournalEntry[],
  accounts: LedgerAccount[],
  asAt?: string,
): BalanceSheet {
  const asAtRange: { to?: string } = asAt ? { to: asAt } : {};
  const { rows } = trialBalance(entries, accounts, asAtRange);
  const assets = rows.filter((row) => row.account.type === "asset");
  const liabilities = rows.filter((row) => row.account.type === "liability");
  const equity = rows.filter((row) => row.account.type === "equity");

  const totalAssets = round2(assets.reduce((sum, row) => sum + row.balance, 0));
  const totalLiabilities = round2(liabilities.reduce((sum, row) => sum + row.balance, 0));
  const bookedEquity = round2(equity.reduce((sum, row) => sum + row.balance, 0));
  const pnl = incomeStatement(entries, accounts, asAtRange);
  const retainedEarnings = pnl.netProfit;
  const totalEquity = round2(bookedEquity + retainedEarnings);

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    retainedEarnings,
    balanced: round2(totalAssets - (totalLiabilities + totalEquity)) === 0,
  };
}

export interface CashFlow {
  opening: number;
  inflow: number;
  outflow: number;
  closing: number;
  movements: { account: LedgerAccount; inflow: number; outflow: number; net: number }[];
}

/** Direct-method cash movement across every cash/bank/MoMo account. */
export function cashFlow(
  entries: JournalEntry[],
  accounts: LedgerAccount[],
  range: { from?: string; to?: string },
): CashFlow {
  const cashAccounts = accounts.filter(
    (account) => account.type === "asset" && account.subtype === "cash",
  );
  const ids = new Set(cashAccounts.map((account) => account.id));

  const openingLines = range.from
    ? postedLines(entries).filter((line) => ids.has(line.account_id) && line.entry_date < range.from!)
    : [];
  const opening = round2(
    openingLines.reduce((sum, line) => sum + Number(line.debit || 0) - Number(line.credit || 0), 0),
  );

  const periodLines = postedLines(entries, range).filter((line) => ids.has(line.account_id));
  const inflow = round2(periodLines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
  const outflow = round2(periodLines.reduce((sum, line) => sum + Number(line.credit || 0), 0));

  const movements = cashAccounts
    .map((account) => {
      const own = periodLines.filter((line) => line.account_id === account.id);
      const accountIn = round2(own.reduce((sum, line) => sum + Number(line.debit || 0), 0));
      const accountOut = round2(own.reduce((sum, line) => sum + Number(line.credit || 0), 0));
      return {
        account,
        inflow: accountIn,
        outflow: accountOut,
        net: round2(accountIn - accountOut),
      };
    })
    .filter((row) => row.inflow !== 0 || row.outflow !== 0);

  return { opening, inflow, outflow, closing: round2(opening + inflow - outflow), movements };
}

export interface TaxSummary {
  taxableRevenue: number;
  vatRate: number;
  levyRate: number;
  vatDue: number;
  levyDue: number;
  vatCollected: number;
  levyCollected: number;
  totalDue: number;
}

/** Ghana VAT + NHIL/GETFund/COVID levy estimate on platform revenue. */
export function taxSummary(
  entries: JournalEntry[],
  accounts: LedgerAccount[],
  range: { from?: string; to?: string },
  rates: { vatRate: number; levyRate: number },
): TaxSummary {
  const pnl = incomeStatement(entries, accounts, range);
  const { rows } = trialBalance(entries, accounts, range);
  const vatCollected = round2(
    rows
      .filter((row) => row.account.code === "2200")
      .reduce((sum, row) => sum + row.balance, 0),
  );
  const levyCollected = round2(
    rows
      .filter((row) => row.account.code === "2210")
      .reduce((sum, row) => sum + row.balance, 0),
  );
  const taxableRevenue = pnl.totalRevenue;
  const levyDue = round2(taxableRevenue * (rates.levyRate / 100));
  const vatDue = round2((taxableRevenue + levyDue) * (rates.vatRate / 100));
  return {
    taxableRevenue,
    vatRate: rates.vatRate,
    levyRate: rates.levyRate,
    vatDue,
    levyDue,
    vatCollected,
    levyCollected,
    totalDue: round2(vatDue + levyDue),
  };
}

/* ---------------------------------------------------------------- CSV export */

export function toCsv(rows: (string | number)[][]) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/* ---------------------------------------------------------- finance settings */

export interface FinanceSettings {
  /** Ghana standard VAT rate, percent. */
  vatRate: number;
  /** Combined NHIL + GETFund + COVID levy rate, percent. */
  levyRate: number;
  /** Withholding tax applied to specialist payouts, percent. */
  withholdingRate: number;
  /** Month the financial year starts on (1 = January). */
  fiscalYearStartMonth: number;
  /** Reporting currency label. */
  currency: string;
  /** Registered business name printed on statements. */
  legalName: string;
  /** Ghana Revenue Authority TIN. */
  taxNumber: string;
  /** Recognise membership fees over the subscription period instead of on payment. */
  deferMembershipRevenue: boolean;
}

export const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  vatRate: 15,
  levyRate: 6,
  withholdingRate: 7.5,
  fiscalYearStartMonth: 1,
  currency: "GHS",
  legalName: "Ashnight Ghana Ltd",
  taxNumber: "",
  deferMembershipRevenue: false,
};
