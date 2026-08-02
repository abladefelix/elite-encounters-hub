import { ExportMenu } from "@/components/admin/export-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ACCOUNT_TYPE_LABEL,
  cedis,
  type AccountBalance,
  type BalanceSheet,
  type CashFlow,
  type IncomeStatement,
  type TaxSummary,
} from "@/lib/finance";

interface StatementLine {
  section: string;
  code: string;
  account: string;
  amount: number;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={
        strong
          ? "flex items-center justify-between border-t pt-2 text-sm font-semibold"
          : "flex items-center justify-between text-sm"
      }
    >
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function Group({ title, rows }: { title: string; rows: AccountBalance[] }) {
  return (
    <div className="space-y-2">
      <p className="eyebrow text-muted-foreground">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity.</p>
      ) : (
        rows.map((row) => (
          <Row
            key={row.account.id}
            label={`${row.account.code} · ${row.account.name}`}
            value={cedis(row.balance)}
          />
        ))
      )}
    </div>
  );
}

export function ReportsPanel({
  trial,
  pnl,
  sheet,
  cash,
  tax,
  rangeLabel,
}: {
  trial: { rows: AccountBalance[]; debit: number; credit: number; balanced: boolean };
  pnl: IncomeStatement;
  sheet: BalanceSheet;
  cash: CashFlow;
  tax: TaxSummary;
  rangeLabel: string;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Trial balance</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{rangeLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={trial.balanced ? "default" : "destructive"}>
              {trial.balanced ? "Books balance" : "Out of balance"}
            </Badge>
            <ExportMenu
              filename="ashnight-trial-balance"
              title="Trial balance"
              subtitle={rangeLabel}
              columns={[
                { label: "Code", value: (row: AccountBalance) => row.account.code },
                { label: "Account", value: (row: AccountBalance) => row.account.name },
                { label: "Type", value: (row: AccountBalance) => ACCOUNT_TYPE_LABEL[row.account.type] },
                { label: "Debit", value: (row: AccountBalance) => row.debit },
                { label: "Credit", value: (row: AccountBalance) => row.credit },
                { label: "Balance", value: (row: AccountBalance) => row.balance },
              ]}
              rows={trial.rows}
              size="default"
            />

          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trial.rows.map((row) => (
                <TableRow key={row.account.id}>
                  <TableCell className="text-sm">
                    <span className="font-mono text-xs">{row.account.code}</span> {row.account.name}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {ACCOUNT_TYPE_LABEL[row.account.type]}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {row.debit ? cedis(row.debit) : ""}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {row.credit ? cedis(row.credit) : ""}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold">Totals</TableCell>
                <TableCell />
                <TableCell className="text-right font-mono font-semibold">
                  {cedis(trial.debit)}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {cedis(trial.credit)}
                </TableCell>
              </TableRow>
              {trial.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    Nothing posted in this period yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Income statement</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Profit &amp; loss — {rangeLabel}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Group title="Revenue" rows={pnl.revenue} />
            <Row label="Total revenue" value={cedis(pnl.totalRevenue)} strong />
            <Group title="Expenses" rows={pnl.expenses} />
            <Row label="Total expenses" value={cedis(pnl.totalExpenses)} strong />
            <Row label="Gross profit" value={cedis(pnl.grossProfit)} strong />
            <Row
              label={`Net profit (${pnl.margin.toFixed(1)}% margin)`}
              value={cedis(pnl.netProfit)}
              strong
            />
            <ExportMenu
              filename="ashnight-income-statement"
              title="Income statement"
              subtitle={rangeLabel}
              label="Export income statement"
              columns={[
                { label: "Section", value: (row: StatementLine) => row.section },
                { label: "Code", value: (row: StatementLine) => row.code },
                { label: "Account", value: (row: StatementLine) => row.account },
                { label: "Amount", value: (row: StatementLine) => row.amount },
              ]}
              rows={[
                ...pnl.revenue.map((row) => ({
                  section: "Revenue",
                  code: row.account.code,
                  account: row.account.name,
                  amount: row.balance,
                })),
                { section: "Revenue", code: "", account: "Total revenue", amount: pnl.totalRevenue },
                ...pnl.expenses.map((row) => ({
                  section: "Expense",
                  code: row.account.code,
                  account: row.account.name,
                  amount: row.balance,
                })),
                { section: "Expense", code: "", account: "Total expenses", amount: pnl.totalExpenses },
                { section: "Result", code: "", account: "Net profit", amount: pnl.netProfit },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Balance sheet</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Position as at period end</p>
            </div>
            <Badge variant={sheet.balanced ? "default" : "destructive"}>
              {sheet.balanced ? "Balanced" : "Check postings"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <Group title="Assets" rows={sheet.assets} />
            <Row label="Total assets" value={cedis(sheet.totalAssets)} strong />
            <Group title="Liabilities" rows={sheet.liabilities} />
            <Row label="Total liabilities" value={cedis(sheet.totalLiabilities)} strong />
            <Group title="Equity" rows={sheet.equity} />
            <Row label="Retained earnings" value={cedis(sheet.retainedEarnings)} />
            <Row label="Total equity" value={cedis(sheet.totalEquity)} strong />
            <Row
              label="Liabilities + equity"
              value={cedis(sheet.totalLiabilities + sheet.totalEquity)}
              strong
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cash flow</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Direct method across Paystack, bank and MoMo — {rangeLabel}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Opening cash" value={cedis(cash.opening)} />
            <Row label="Cash in" value={cedis(cash.inflow)} />
            <Row label="Cash out" value={cedis(cash.outflow)} />
            <Row label="Closing cash" value={cedis(cash.closing)} strong />
            <div className="space-y-2 pt-2">
              {cash.movements.map((row) => (
                <Row
                  key={row.account.id}
                  label={`${row.account.code} · ${row.account.name}`}
                  value={cedis(row.net)}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tax position</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Ghana VAT and levies on platform revenue — {rangeLabel}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Taxable revenue" value={cedis(tax.taxableRevenue)} />
            <Row label={`Levies (${tax.levyRate}%)`} value={cedis(tax.levyDue)} />
            <Row label={`VAT (${tax.vatRate}%)`} value={cedis(tax.vatDue)} />
            <Row label="Estimated total due" value={cedis(tax.totalDue)} strong />
            <Row label="VAT already booked" value={cedis(tax.vatCollected)} />
            <Row label="Levies already booked" value={cedis(tax.levyCollected)} />
            <p className="pt-2 text-xs text-muted-foreground">
              Rates come from Finance settings. Booked amounts are what actually sits on the VAT and
              levy accounts, so any gap shows what still needs a journal entry before filing.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
