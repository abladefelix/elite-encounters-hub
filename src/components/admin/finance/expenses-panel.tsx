import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ExportMenu } from "@/components/admin/export-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataPager, usePaged } from "@/components/ui/data-pager";
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  cedis,
  useExpenseMutations,
  type DraftExpense,
  type ExpenseRow,
  type LedgerAccount,
} from "@/lib/finance";
import { formatStamp } from "@/lib/utils";


function emptyDraft(): DraftExpense {
  return {
    expenseDate: new Date().toISOString().slice(0, 10),
    vendor: "",
    category: "general",
    accountId: "",
    amount: 0,
    taxAmount: 0,
    paymentMethod: "bank",
    reference: "",
    memo: "",
    status: "paid",
    fundingAccountId: "",
  };
}

export function ExpensesPanel({
  expenses,
  accounts,
  loading,
}: {
  expenses: ExpenseRow[];
  accounts: LedgerAccount[];
  loading: boolean;
}) {
  const { create, update, remove } = useExpenseMutations();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftExpense>(emptyDraft);
  const [search, setSearch] = useState("");

  const expenseAccounts = accounts.filter((account) => account.type === "expense" && account.active);
  const fundingAccounts = accounts.filter(
    (account) =>
      account.active &&
      ((account.type === "asset" && account.subtype === "cash") ||
        (account.type === "liability" && account.subtype === "payable")),
  );

  const rows = expenses.filter((row) =>
    search.trim()
      ? `${row.vendor} ${row.category} ${row.reference} ${row.memo}`
          .toLowerCase()
          .includes(search.toLowerCase())
      : true,
  );
  const paged = usePaged(rows, 12);
  const total = rows.reduce((sum, row) => sum + Number(row.amount) + Number(row.tax_amount), 0);

  async function submit() {
    try {
      await create.mutateAsync(draft);
      toast.success("Expense recorded and posted to the journal.");
      setDraft(emptyDraft());
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record that expense.");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Expenses &amp; payables</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Each expense posts a balanced journal entry automatically: the expense account is
            debited and the funding account credited. Total shown: {cedis(total)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportMenu
            filename="ashnight-expenses"
            title="Expenses & payables"
            columns={[
              { label: "Date", value: (row: ExpenseRow) => row.expense_date },
              { label: "Recorded", value: (row: ExpenseRow) => formatStamp(row.created_at) },

              { label: "Vendor", value: (row: ExpenseRow) => row.vendor },
              { label: "Category", value: (row: ExpenseRow) => row.category },
              { label: "Amount", value: (row: ExpenseRow) => Number(row.amount) },
              { label: "Tax", value: (row: ExpenseRow) => Number(row.tax_amount) },
              { label: "Method", value: (row: ExpenseRow) => row.payment_method },
              { label: "Status", value: (row: ExpenseRow) => row.status },
              { label: "Reference", value: (row: ExpenseRow) => row.reference },
            ]}
            rows={rows}
            size="default"
          />
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Record expense
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search vendor, category or reference"
          className="w-full sm:max-w-sm"
          aria-label="Search expenses"
        />

        {loading ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : null}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-sm">{row.expense_date}</TableCell>
                  <TableCell>
                    <div className="font-medium">{row.vendor || "—"}</div>
                    <div className="text-xs text-muted-foreground">{row.memo || row.reference}</div>
                  </TableCell>
                  <TableCell className="text-sm">{row.category}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {cedis(Number(row.amount))}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {cedis(Number(row.tax_amount))}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() =>
                        void update
                          .mutateAsync({
                            id: row.id,
                            patch: { status: row.status === "paid" ? "recorded" : "paid" },
                          })
                          .then(() => toast.success("Expense status updated."))
                      }
                    >
                      <Badge variant={row.status === "paid" ? "default" : "secondary"}>
                        {row.status}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        void remove
                          .mutateAsync(row)
                          .then(() => toast.success("Expense and its journal entry removed."))
                      }
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Delete expense</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    No expenses recorded yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        <DataPager paged={paged} label="expenses" />
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Record an expense</DialogTitle>
            <DialogDescription>
              Choose “Accounts payable” as the funding account for a supplier invoice you haven't
              paid yet.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ex-date">Date</Label>
                <Input
                  id="ex-date"
                  type="date"
                  value={draft.expenseDate}
                  onChange={(event) => setDraft({ ...draft, expenseDate: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ex-vendor">Vendor</Label>
                <Input
                  id="ex-vendor"
                  value={draft.vendor}
                  onChange={(event) => setDraft({ ...draft, vendor: event.target.value })}
                  placeholder="Paystack, MTN, landlord…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ex-amount">Amount (GHS)</Label>
                <Input
                  id="ex-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.amount || ""}
                  onChange={(event) => setDraft({ ...draft, amount: Number(event.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ex-tax">Recoverable VAT (GHS)</Label>
                <Input
                  id="ex-tax"
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.taxAmount || ""}
                  onChange={(event) => setDraft({ ...draft, taxAmount: Number(event.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ex-account">Expense account</Label>
                <Select
                  value={draft.accountId}
                  onValueChange={(value) => setDraft({ ...draft, accountId: value })}
                >
                  <SelectTrigger id="ex-account">
                    <SelectValue placeholder="Choose account" />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code} — {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ex-funding">Funded from</Label>
                <Select
                  value={draft.fundingAccountId}
                  onValueChange={(value) => setDraft({ ...draft, fundingAccountId: value })}
                >
                  <SelectTrigger id="ex-funding">
                    <SelectValue placeholder="Bank, MoMo or payable" />
                  </SelectTrigger>
                  <SelectContent>
                    {fundingAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code} — {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ex-category">Category</Label>
                <Select
                  value={draft.category}
                  onValueChange={(value) => setDraft({ ...draft, category: value })}
                >
                  <SelectTrigger id="ex-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ex-method">Payment method</Label>
                <Select
                  value={draft.paymentMethod}
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      paymentMethod: value,
                      status: value === "payable" ? "recorded" : "paid",
                    })
                  }
                >
                  <SelectTrigger id="ex-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {method}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ex-reference">Reference</Label>
              <Input
                id="ex-reference"
                value={draft.reference}
                onChange={(event) => setDraft({ ...draft, reference: event.target.value })}
                placeholder="Invoice or receipt number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ex-memo">Memo</Label>
              <Textarea
                id="ex-memo"
                rows={2}
                value={draft.memo}
                onChange={(event) => setDraft({ ...draft, memo: event.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={create.isPending}>
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
