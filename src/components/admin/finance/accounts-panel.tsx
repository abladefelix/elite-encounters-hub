import { useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { Switch } from "@/components/ui/switch";
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
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABEL,
  cedis,
  downloadCsv,
  isDebitAccount,
  useAccountMutations,
  type AccountBalance,
  type AccountType,
  type LedgerAccount,
} from "@/lib/finance";

const EMPTY = {
  code: "",
  name: "",
  type: "expense" as AccountType,
  subtype: "operating",
  description: "",
  active: true,
};

export function AccountsPanel({
  accounts,
  balances,
  loading,
}: {
  accounts: LedgerAccount[];
  balances: AccountBalance[];
  loading: boolean;
}) {
  const { create, update, remove } = useAccountMutations();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LedgerAccount | null>(null);
  const [draft, setDraft] = useState(EMPTY);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<AccountType | "all">("all");

  const balanceOf = useMemo(
    () => new Map(balances.map((row) => [row.account.id, row.balance])),
    [balances],
  );

  const rows = accounts
    .filter((account) => (typeFilter === "all" ? true : account.type === typeFilter))
    .filter((account) =>
      search.trim()
        ? `${account.code} ${account.name} ${account.subtype}`
            .toLowerCase()
            .includes(search.toLowerCase())
        : true,
    );
  const paged = usePaged(rows, 12);

  function startCreate() {
    setEditing(null);
    setDraft(EMPTY);
    setOpen(true);
  }

  function startEdit(account: LedgerAccount) {
    setEditing(account);
    setDraft({
      code: account.code,
      name: account.name,
      type: account.type,
      subtype: account.subtype,
      description: account.description,
      active: account.active,
    });
    setOpen(true);
  }

  async function save() {
    if (!draft.code.trim() || !draft.name.trim()) {
      toast.error("An account needs both a code and a name.");
      return;
    }
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch: draft });
        toast.success(`${draft.code} updated.`);
      } else {
        await create.mutateAsync(draft);
        toast.success(`${draft.code} added to the chart of accounts.`);
      }
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save that account.");
    }
  }

  async function destroy(account: LedgerAccount) {
    if (account.is_system) {
      toast.error("System accounts are used by automatic postings and can't be deleted.");
      return;
    }
    try {
      await remove.mutateAsync(account.id);
      toast.success(`${account.code} removed.`);
    } catch {
      toast.error("That account already has postings — deactivate it instead.");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Chart of accounts</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Every posting lands on one of these accounts. System accounts are wired into the
            automatic escrow, commission and payout postings.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv("ashnight-chart-of-accounts.csv", [
                ["Code", "Name", "Type", "Subtype", "Balance", "Active"],
                ...rows.map((account) => [
                  account.code,
                  account.name,
                  account.type,
                  account.subtype,
                  balanceOf.get(account.id) ?? 0,
                  account.active ? "yes" : "no",
                ]),
              ])
            }
          >
            Export CSV
          </Button>
          <Button onClick={startCreate}>
            <Plus className="size-4" /> New account
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Select
            value={typeFilter}
            onValueChange={(value) => setTypeFilter(value as AccountType | "all")}
          >
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All account types</SelectItem>
              {ACCOUNT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {ACCOUNT_TYPE_LABEL[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search code or name"
            className="w-full sm:max-w-xs"
            aria-label="Search accounts"
          />
        </div>

        {loading ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : null}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.rows.map((account) => (
                <TableRow key={account.id} className={account.active ? "" : "opacity-60"}>
                  <TableCell className="font-mono text-xs">{account.code}</TableCell>
                  <TableCell>
                    <div className="font-medium">{account.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {account.subtype || "—"}
                      {account.is_system ? " · system" : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{ACCOUNT_TYPE_LABEL[account.type]}</Badge>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {isDebitAccount(account.type) ? "Debit balance" : "Credit balance"}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {cedis(balanceOf.get(account.id) ?? 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(account)}>
                        <Pencil className="size-4" />
                        <span className="sr-only">Edit {account.name}</span>
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => void destroy(account)}>
                        <Trash2 className="size-4" />
                        <span className="sr-only">Delete {account.name}</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No accounts match that filter.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        <DataPager paged={paged} label="accounts" />
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.code}` : "New ledger account"}</DialogTitle>
            <DialogDescription>
              Use standard numbering: 1000s assets, 2000s liabilities, 3000s equity, 4000s revenue,
              5000s expenses.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="account-code">Code</Label>
                <Input
                  id="account-code"
                  value={draft.code}
                  onChange={(event) => setDraft({ ...draft, code: event.target.value })}
                  placeholder="5200"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-type">Type</Label>
                <Select
                  value={draft.type}
                  onValueChange={(value) => setDraft({ ...draft, type: value as AccountType })}
                >
                  <SelectTrigger id="account-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {ACCOUNT_TYPE_LABEL[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-name">Name</Label>
              <Input
                id="account-name"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="Marketing and acquisition"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-subtype">Subtype</Label>
              <Input
                id="account-subtype"
                value={draft.subtype}
                onChange={(event) => setDraft({ ...draft, subtype: event.target.value })}
                placeholder="cash · receivable · operating · cogs · tax"
              />
              <p className="text-xs text-muted-foreground">
                Use <span className="font-mono">cash</span> for bank, Paystack and MoMo accounts so
                they appear in the cash-flow statement, and <span className="font-mono">cogs</span>{" "}
                for direct service costs so gross profit is correct.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-description">Description</Label>
              <Textarea
                id="account-description"
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                rows={2}
              />
            </div>
            <label className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm">Active</span>
              <Switch
                checked={draft.active}
                onCheckedChange={(checked) => setDraft({ ...draft, active: checked })}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Save account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
