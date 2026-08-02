import { useState } from "react";
import { Ban, Loader2, Plus, RefreshCcw, Trash2 } from "lucide-react";
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
  cedis,
  entryTotals,
  useJournalMutations,
  type DraftLine,
  type JournalEntry,
  type JournalStatus,
  type LedgerAccount,
} from "@/lib/finance";

interface LedgerLine {
  entryNo: string;
  date: string;
  status: string;
  source: string;
  account: string;
  description: string;
  debit: number;
  credit: number;
}

const STATUS_TONE: Record<JournalStatus, "default" | "secondary" | "destructive"> = {
  posted: "default",
  draft: "secondary",
  void: "destructive",
};

function blankLine(): DraftLine {
  return { accountId: "", debit: 0, credit: 0, description: "" };
}

export function JournalPanel({
  entries,
  accounts,
  loading,
  onSync,
  syncing,
}: {
  entries: JournalEntry[];
  accounts: LedgerAccount[];
  loading: boolean;
  onSync: () => void;
  syncing: boolean;
}) {
  const { post, setStatus, remove } = useJournalMutations();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<JournalStatus | "all">("all");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [reference, setReference] = useState("");
  const [status, setDraftStatus] = useState<JournalStatus>("posted");
  const [lines, setLines] = useState<DraftLine[]>([blankLine(), blankLine()]);

  const rows = entries
    .filter((entry) => (statusFilter === "all" ? true : entry.status === statusFilter))
    .filter((entry) =>
      search.trim()
        ? `${entry.entry_no} ${entry.memo} ${entry.reference} ${entry.source}`
            .toLowerCase()
            .includes(search.toLowerCase())
        : true,
    );
  const paged = usePaged(rows, 10);
  const totals = entryTotals(lines.filter((line) => line.accountId));

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line, position) => (position === index ? { ...line, ...patch } : line)),
    );
  }

  async function submit() {
    try {
      await post.mutateAsync({ entryDate, memo, reference, status, lines });
      toast.success("Journal entry posted.");
      setOpen(false);
      setMemo("");
      setReference("");
      setLines([blankLine(), blankLine()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not post that entry.");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>General journal</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Every payment, payout, refund and manual adjustment as a balanced double-entry record.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onSync} disabled={syncing}>
            {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
            Sync from platform activity
          </Button>
          <ExportMenu
            filename="ashnight-general-ledger"
            title="General journal"
            columns={[
              { label: "Entry", value: (row: LedgerLine) => row.entryNo },
              { label: "Date", value: (row: LedgerLine) => row.date },
              { label: "Status", value: (row: LedgerLine) => row.status },
              { label: "Source", value: (row: LedgerLine) => row.source },
              { label: "Account", value: (row: LedgerLine) => row.account },
              { label: "Description", value: (row: LedgerLine) => row.description },
              { label: "Debit", value: (row: LedgerLine) => row.debit },
              { label: "Credit", value: (row: LedgerLine) => row.credit },
            ]}
            rows={rows.flatMap((entry) =>
              entry.lines.map((line) => ({
                entryNo: entry.entry_no,
                date: entry.entry_date,
                status: entry.status,
                source: entry.source,
                account: `${line.account?.code ?? ""} ${line.account?.name ?? ""}`.trim(),
                description: line.description || entry.memo,
                debit: Number(line.debit),
                credit: Number(line.credit),
              })),
            )}
            size="default"
          />
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New entry
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as JournalStatus | "all")}
          >
            <SelectTrigger className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="posted">Posted</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="void">Void</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Entry number, memo, reference or source"
            className="w-full sm:max-w-sm"
            aria-label="Search journal"
          />
        </div>

        {loading ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : null}

        <div className="space-y-3">
          {paged.rows.map((entry) => {
            const entryTotal = entryTotals(entry.lines);
            return (
              <div key={entry.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs">{entry.entry_no}</span>
                      <Badge variant={STATUS_TONE[entry.status]}>{entry.status}</Badge>
                      <Badge variant="outline">{entry.source}</Badge>
                    </div>
                    <p className="mt-1 text-sm font-medium">{entry.memo || "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.entry_date}
                      {entry.reference ? ` · ${entry.reference}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{cedis(entryTotal.debit)}</span>
                    {entry.status === "posted" ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Void entry"
                        onClick={() =>
                          void setStatus
                            .mutateAsync({ id: entry.id, status: "void" })
                            .then(() => toast.success("Entry voided."))
                        }
                      >
                        <Ban className="size-4" />
                      </Button>
                    ) : (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Post entry"
                        onClick={() =>
                          void setStatus
                            .mutateAsync({ id: entry.id, status: "posted" })
                            .then(() => toast.success("Entry posted."))
                        }
                      >
                        <RefreshCcw className="size-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Delete entry"
                      onClick={() =>
                        void remove
                          .mutateAsync(entry.id)
                          .then(() => toast.success("Entry deleted."))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entry.lines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell className="text-sm">
                            <span className="font-mono text-xs">{line.account?.code}</span>{" "}
                            {line.account?.name}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {line.description || "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {Number(line.debit) ? cedis(Number(line.debit)) : ""}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {Number(line.credit) ? cedis(Number(line.credit)) : ""}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })}
          {!loading && rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No journal entries yet. Run “Sync from platform activity” to book existing payments.
            </p>
          ) : null}
        </div>

        <DataPager paged={paged} label="entries" />
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>New journal entry</DialogTitle>
            <DialogDescription>
              Debits must equal credits before the entry can be posted.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="je-date">Date</Label>
              <Input
                id="je-date"
                type="date"
                value={entryDate}
                onChange={(event) => setEntryDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="je-ref">Reference</Label>
              <Input
                id="je-ref"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Invoice / Paystack ref"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="je-status">Status</Label>
              <Select
                value={status}
                onValueChange={(value) => setDraftStatus(value as JournalStatus)}
              >
                <SelectTrigger id="je-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="posted">Post immediately</SelectItem>
                  <SelectItem value="draft">Save as draft</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="je-memo">Memo</Label>
            <Textarea
              id="je-memo"
              rows={2}
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              placeholder="What this entry records"
            />
          </div>

          <div className="space-y-3">
            {lines.map((line, index) => (
              <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-12">
                <div className="sm:col-span-5">
                  <Select
                    value={line.accountId}
                    onValueChange={(value) => updateLine(index, { accountId: value })}
                  >
                    <SelectTrigger aria-label={`Account for line ${index + 1}`}>
                      <SelectValue placeholder="Choose account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts
                        .filter((account) => account.active)
                        .map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.code} — {account.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-3">
                  <Input
                    value={line.description}
                    onChange={(event) => updateLine(index, { description: event.target.value })}
                    placeholder="Line description"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.debit || ""}
                    onChange={(event) =>
                      updateLine(index, { debit: Number(event.target.value), credit: 0 })
                    }
                    placeholder="Debit"
                    aria-label={`Debit for line ${index + 1}`}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.credit || ""}
                    onChange={(event) =>
                      updateLine(index, { credit: Number(event.target.value), debit: 0 })
                    }
                    placeholder="Credit"
                    aria-label={`Credit for line ${index + 1}`}
                  />
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setLines([...lines, blankLine()])}>
              <Plus className="size-4" /> Add line
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 p-3 text-sm">
            <span>
              Debits <span className="font-mono">{cedis(totals.debit)}</span> · Credits{" "}
              <span className="font-mono">{cedis(totals.credit)}</span>
            </span>
            <Badge variant={totals.balanced ? "default" : "destructive"}>
              {totals.balanced ? "Balanced" : "Out of balance"}
            </Badge>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={post.isPending}>
              {post.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
