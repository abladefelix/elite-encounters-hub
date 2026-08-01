import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FileText, Loader2, ReceiptText, Wallet } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { DocumentCard } from "@/routes/support";
import { useDocuments, type DocumentKind } from "@/lib/support";
import { money } from "@/lib/types";

export const Route = createFileRoute("/ashnight-control/documents")({
  head: () => ({
    meta: [
      { title: "Invoices & receipts | Ashnight Admin" },
      {
        name: "description",
        content:
          "Every Ashnight invoice and receipt in GHS, searchable by number or Paystack reference and printable to PDF.",
      },
      { property: "og:title", content: "Invoices & receipts | Ashnight Admin" },
      { property: "og:description", content: "Ashnight billing document archive." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminDocuments,
});

function AdminDocuments() {
  const [kind, setKind] = useState<DocumentKind | "all">("all");
  const [search, setSearch] = useState("");
  const documents = useDocuments(kind === "all" ? undefined : kind);

  const rows = (documents.data ?? []).filter((row) =>
    search.trim()
      ? `${row.number} ${row.title} ${row.paystack_reference ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase())
      : true,
  );

  const invoiced = rows.filter((row) => row.kind === "invoice").reduce((sum, row) => sum + row.total, 0);
  const receipted = rows.filter((row) => row.kind === "receipt").reduce((sum, row) => sum + row.total, 0);

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow text-primary">Billing</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Invoices &amp; receipts
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Issued automatically for bookings, gifts and room memberships. Print any document to hand
          it to a client or your accountant.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Documents" value={String(rows.length)} icon={FileText} />
        <StatCard label="Invoiced" value={money(invoiced)} icon={Wallet} />
        <StatCard label="Receipted" value={money(receipted)} icon={ReceiptText} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={kind} onValueChange={(value) => setKind(value as DocumentKind | "all")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All documents</SelectItem>
            <SelectItem value="invoice">Invoices</SelectItem>
            <SelectItem value="receipt">Receipts</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Number, title or Paystack reference"
          className="w-full sm:max-w-sm"
          aria-label="Search documents"
        />
      </div>

      {documents.isLoading ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : null}

      <div className="space-y-4">
        {rows.map((row) => (
          <DocumentCard key={row.id} row={row} />
        ))}
        {!documents.isLoading && rows.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No documents match that search.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
