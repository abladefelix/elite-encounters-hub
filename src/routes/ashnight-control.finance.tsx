import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Coins, Landmark, PiggyBank, Scale, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";

import { AccountsPanel } from "@/components/admin/finance/accounts-panel";
import { ExpensesPanel } from "@/components/admin/finance/expenses-panel";
import { JournalPanel } from "@/components/admin/finance/journal-panel";
import { PeriodsPanel } from "@/components/admin/finance/periods-panel";
import { ReportsPanel } from "@/components/admin/finance/reports-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSettingsSection } from "@/lib/platform-settings";
import {
  DEFAULT_FINANCE_SETTINGS,
  balanceSheet,
  cashFlow,
  cedis,
  incomeStatement,
  taxSummary,
  trialBalance,
  useAccountingPeriods,
  useExpenses,
  useJournal,
  useLedgerAccounts,
  type FinanceSettings,
} from "@/lib/finance";
import { syncLedgerEntries } from "@/lib/finance.functions";

export const Route = createFileRoute("/ashnight-control/finance")({
  head: () => ({
    meta: [
      { title: "Finance & accounting | Ashnight Admin" },
      {
        name: "description",
        content:
          "Double-entry accounting for Ashnight: chart of accounts, general journal, expenses, trial balance, income statement, balance sheet, cash flow and Ghana VAT position.",
      },
      { property: "og:title", content: "Finance & accounting | Ashnight Admin" },
      {
        property: "og:description",
        content: "Ashnight ledger, statements and tax position in GHS.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminFinance,
});

function monthStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}

function AdminFinance() {
  const accountsQuery = useLedgerAccounts();
  const journalQuery = useJournal();
  const expensesQuery = useExpenses();
  const periodsQuery = useAccountingPeriods();
  const { value: settings, save, loading: settingsLoading } = useSettingsSection<FinanceSettings>(
    "finance",
    DEFAULT_FINANCE_SETTINGS,
  );

  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [syncing, setSyncing] = useState(false);
  const sync = useServerFn(syncLedgerEntries);

  const accounts = accountsQuery.data ?? [];
  const entries = journalQuery.data ?? [];
  const range = useMemo(() => ({ from, to }), [from, to]);

  const trial = useMemo(() => trialBalance(entries, accounts, range), [entries, accounts, range]);
  const pnl = useMemo(() => incomeStatement(entries, accounts, range), [entries, accounts, range]);
  const sheet = useMemo(() => balanceSheet(entries, accounts, to), [entries, accounts, to]);
  const cash = useMemo(() => cashFlow(entries, accounts, range), [entries, accounts, range]);
  const tax = useMemo(
    () =>
      taxSummary(entries, accounts, range, {
        vatRate: settings.vatRate,
        levyRate: settings.levyRate,
      }),
    [entries, accounts, range, settings.vatRate, settings.levyRate],
  );
  const cumulative = useMemo(() => trialBalance(entries, accounts), [entries, accounts]);

  const escrowHeld = cumulative.rows
    .filter((row) => row.account.code === "2000")
    .reduce((sum, row) => sum + row.balance, 0);

  async function runSync() {
    setSyncing(true);
    try {
      const result = await sync({});
      await Promise.all([journalQuery.refetch(), accountsQuery.refetch()]);
      toast.success(
        `Ledger synced — ${result.posted} entr${result.posted === 1 ? "y" : "ies"} posted from ${result.scanned} money movements.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ledger sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  const rangeLabel = `${from} → ${to}`;

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow text-primary">Finance</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Finance &amp; accounting
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Full double-entry books for Ashnight in GHS — chart of accounts, general journal,
          expenses, monthly close, and statements your accountant can file from.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
        <div className="space-y-2">
          <Label htmlFor="range-from">From</Label>
          <Input
            id="range-from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="range-to">To</Label>
          <Input
            id="range-to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Reporting window applies to every statement below. The balance sheet is cumulative up to
          the “to” date.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue" value={cedis(pnl.totalRevenue)} icon={TrendingUp} />
        <StatCard label="Expenses" value={cedis(pnl.totalExpenses)} icon={Coins} />
        <StatCard
          label="Net profit"
          value={cedis(pnl.netProfit)}
          hint={`${pnl.margin.toFixed(1)}% margin`}
          icon={PiggyBank}
          tone={pnl.netProfit >= 0 ? "success" : "destructive"}
        />
        <StatCard
          label="Cash on hand"
          value={cedis(cash.closing)}
          hint="Paystack + bank + MoMo"
          icon={Wallet}
        />
        <StatCard label="Held in escrow" value={cedis(escrowHeld)} icon={Landmark} tone="soft" />
        <StatCard label="Total assets" value={cedis(sheet.totalAssets)} icon={Scale} />
        <StatCard label="Tax estimated due" value={cedis(tax.totalDue)} icon={BookOpen} />
        <StatCard
          label="Books"
          value={trial.balanced ? "Balanced" : "Check postings"}
          hint={`Debits ${cedis(trial.debit)}`}
          icon={Scale}
          tone={trial.balanced ? "success" : "warning"}
        />
      </div>

      <Tabs defaultValue="reports">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="reports">Statements</TabsTrigger>
          <TabsTrigger value="journal">Journal</TabsTrigger>
          <TabsTrigger value="accounts">Chart of accounts</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="close">Close &amp; settings</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="mt-6">
          <ReportsPanel
            trial={trial}
            pnl={pnl}
            sheet={sheet}
            cash={cash}
            tax={tax}
            rangeLabel={rangeLabel}
          />
        </TabsContent>

        <TabsContent value="journal" className="mt-6">
          <JournalPanel
            entries={entries}
            accounts={accounts}
            loading={journalQuery.isLoading}
            onSync={() => void runSync()}
            syncing={syncing}
          />
        </TabsContent>

        <TabsContent value="accounts" className="mt-6">
          <AccountsPanel
            accounts={accounts}
            balances={cumulative.rows}
            loading={accountsQuery.isLoading}
          />
        </TabsContent>

        <TabsContent value="expenses" className="mt-6">
          <ExpensesPanel
            expenses={expensesQuery.data ?? []}
            accounts={accounts}
            loading={expensesQuery.isLoading}
          />
        </TabsContent>

        <TabsContent value="close" className="mt-6">
          <PeriodsPanel
            periods={periodsQuery.data ?? []}
            settings={settings}
            onSaveSettings={save}
            savingSettings={settingsLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
