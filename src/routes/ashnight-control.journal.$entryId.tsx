import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Receipt, User } from "lucide-react";

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
import { ESCROW_STATE_LABEL } from "@/lib/escrow";
import { cedis, entryTotals, periodLabel, useJournalEntryDetail } from "@/lib/finance";
import { money } from "@/lib/types";
import { formatStamp, formatStampPrecise } from "@/lib/utils";

export const Route = createFileRoute("/ashnight-control/journal/$entryId")({
  head: () => ({
    meta: [
      { title: "Journal entry | Ashnight Admin" },
      {
        name: "description",
        content:
          "Full detail for a single Ashnight journal entry: debit and credit lines, timestamps, escrow movement and the members involved.",
      },
      { property: "og:title", content: "Journal entry | Ashnight Admin" },
      {
        property: "og:description",
        content: "Debits, credits, timestamps and the members behind one ledger transaction.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JournalEntryDetailPage,
  errorComponent: ({ error }) => (
    <div className="space-y-4">
      <BackLink />
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : "Could not load that journal entry."}
      </p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="space-y-4">
      <BackLink />
      <p className="text-sm text-muted-foreground">That journal entry no longer exists.</p>
    </div>
  ),
});

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link to="/ashnight-control/finance">
        <ArrowLeft className="size-4" /> Back to finance
      </Link>
    </Button>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}

function JournalEntryDetailPage() {
  const { entryId } = Route.useParams();
  const detail = useJournalEntryDetail(entryId);

  if (detail.isLoading) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (detail.error || !detail.data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="text-sm text-destructive">
          {detail.error instanceof Error
            ? detail.error.message
            : "Could not load that journal entry."}
        </p>
      </div>
    );
  }

  const { entry, escrow, expense, parties } = detail.data;
  const totals = entryTotals(entry.lines);

  return (
    <div className="space-y-6">
      <BackLink />

      <header>
        <p className="eyebrow text-primary">Journal entry</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {entry.entry_no}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={entry.status === "posted" ? "default" : "secondary"}>
            {entry.status}
          </Badge>
          <Badge variant="outline">{entry.source}</Badge>
          <Badge variant="outline">{periodLabel(entry.period)}</Badge>
          {totals.balanced ? null : (
            <Badge variant="destructive">Unbalanced — check the lines</Badge>
          )}
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{entry.memo || "No memo."}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Transaction timeline</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Accounting date" value={entry.entry_date} />
          <Field label="Recorded" value={formatStampPrecise(entry.created_at)} />
          <Field label="Posted" value={formatStampPrecise(entry.posted_at)} />
          <Field label="Last updated" value={formatStampPrecise(entry.updated_at)} />
          <Field label="Reference" value={entry.reference || "—"} />
          <Field label="Currency" value={entry.currency} />
          <Field label="Total debits" value={cedis(totals.debit)} />
          <Field label="Total credits" value={cedis(totals.credit)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>People involved</CardTitle>
        </CardHeader>
        <CardContent>
          {parties.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No member is attached to this entry — it was booked by the system.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {parties.map((party) => (
                <div key={`${party.id}-${party.role}`} className="rounded-xl border p-4">
                  <div className="flex items-center gap-2">
                    <User className="size-4 text-primary" />
                    <p className="font-medium">{party.name}</p>
                  </div>
                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {party.role}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {party.username ? `@${party.username}` : "no username"}
                    {party.city ? ` · ${party.city}` : ""}
                    {party.accountStatus ? ` · ${party.accountStatus}` : ""}
                  </p>
                  <Button asChild variant="ghost" size="sm" className="mt-2 px-0">
                    <Link to="/ashnight-control/users" search={{ q: party.id } as never}>
                      Open in members
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Debit &amp; credit lines</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Recorded</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entry.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="text-xs text-muted-foreground">{line.line_no}</TableCell>
                  <TableCell className="text-sm">
                    <span className="font-mono text-xs">{line.account?.code}</span>{" "}
                    {line.account?.name}
                    <span className="block text-xs text-muted-foreground">
                      {line.account?.type}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {line.description || entry.memo || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatStamp(line.created_at)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {Number(line.debit) ? cedis(Number(line.debit)) : ""}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {Number(line.credit) ? cedis(Number(line.credit)) : ""}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={4} className="text-right text-xs uppercase tracking-[0.14em]">
                  Totals
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {cedis(totals.debit)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {cedis(totals.credit)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {escrow ? (
        <Card>
          <CardHeader>
            <CardTitle>Escrow movement</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Label" value={escrow.label} />
            <Field label="Kind" value={escrow.kind} />
            <Field label="State" value={ESCROW_STATE_LABEL[escrow.state] ?? escrow.state} />
            <Field label="Paystack reference" value={escrow.paystack_reference || "—"} />
            <Field label="Gross" value={money(escrow.amount)} />
            <Field label="Platform fee" value={money(escrow.platform_fee)} />
            <Field label="Payout" value={money(escrow.payout_amount)} />
            <Field label="Hold window" value={`${escrow.hold_hours}h`} />
            <Field label="Created" value={formatStampPrecise(escrow.created_at)} />
            <Field label="Paid" value={formatStampPrecise(escrow.paid_at)} />
            <Field label="Releases" value={formatStampPrecise(escrow.release_at)} />
            <Field label="Released" value={formatStampPrecise(escrow.released_at)} />
            {escrow.disputed_at ? (
              <Field label="Disputed" value={formatStampPrecise(escrow.disputed_at)} />
            ) : null}
            {escrow.booking ? (
              <>
                <Field label="Service" value={escrow.booking.service_name} />
                <Field label="Booking status" value={escrow.booking.status} />
                <Field
                  label="Scheduled for"
                  value={formatStamp(escrow.booking.scheduled_for)}
                />
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {expense ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="size-4 text-primary" /> Expense record
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Vendor" value={expense.vendor || "—"} />
            <Field label="Category" value={expense.category} />
            <Field label="Amount" value={cedis(Number(expense.amount))} />
            <Field label="Tax" value={cedis(Number(expense.tax_amount))} />
            <Field label="Method" value={expense.payment_method} />
            <Field label="Status" value={expense.status} />
            <Field label="Expense date" value={expense.expense_date} />
            <Field label="Recorded" value={formatStampPrecise(expense.created_at)} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
