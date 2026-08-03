import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bell, Download, FileText, LifeBuoy, Loader2, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import {
  useDocumentTemplates,
  type DocumentTemplate,
} from "@/lib/document-templates";
import { downloadDocumentPdf } from "@/lib/document-pdf";
import { money } from "@/lib/types";

import { formatStamp } from "@/lib/utils";

import {
  COMPLAINT_CATEGORIES,
  documentLines,
  useComplaintMutations,
  useComplaints,
  useDocuments,
  useNotificationMutations,
  useNotifications,
  type DocumentRow,
} from "@/lib/support";

type Tab = "inbox" | "complaints" | "documents";

export const Route = createFileRoute("/support")({
  validateSearch: (search: Record<string, unknown>): { tab: Tab } => {
    const tab = search["tab"];
    return { tab: tab === "complaints" || tab === "documents" ? tab : "inbox" };
  },
  head: () => ({
    meta: [
      { title: "Inbox & support | Ashnight" },
      {
        name: "description",
        content:
          "Read Ashnight notifications, raise a complaint about a booking or payment, and download your GHS invoices and receipts.",
      },
      { property: "og:title", content: "Inbox & support | Ashnight" },
      {
        property: "og:description",
        content: "Notifications, complaints and every invoice or receipt in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  const { tab } = useSearch({ from: "/support" });
  const { user, profile } = useAuth();
  const [active, setActive] = useState<Tab>(tab);

  const notifications = useNotifications(user?.id);
  const { markRead, markAllRead, remove: removeNotification } = useNotificationMutations(user?.id);
  const complaints = useComplaints();
  const documents = useDocuments();
  const { raise } = useComplaintMutations();

  const [category, setCategory] = useState(COMPLAINT_CATEGORIES[0]!);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const unread = (notifications.data ?? []).filter((row) => !row.read_at).length;

  async function submitComplaint() {
    if (!user) return;
    if (subject.trim().length < 4 || body.trim().length < 12) {
      toast.error("Add a short subject and describe what happened.");
      return;
    }
    try {
      await raise.mutateAsync({
        userId: user.id,
        category,
        subject: subject.trim(),
        body: body.trim(),
        contactEmail: user.email ?? "",
      });
      setSubject("");
      setBody("");
      toast.success("Complaint received", {
        description: "Ashnight support will follow up in your inbox.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We couldn't file that complaint.");
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 pb-24 md:pb-10">
      <header>
        <p className="eyebrow text-primary">Your account</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Inbox &amp; support
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {profile?.display_name ? `${profile.display_name} — ` : ""}notifications, complaints and
          every document Ashnight has issued you.
        </p>
      </header>

      <Tabs value={active} onValueChange={(value) => setActive(value as Tab)} className="mt-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="inbox">
            <Bell className="mr-1.5 size-4" /> Inbox{unread ? ` (${unread})` : ""}
          </TabsTrigger>
          <TabsTrigger value="complaints">
            <LifeBuoy className="mr-1.5 size-4" /> Complaints
          </TabsTrigger>
          <TabsTrigger value="documents">
            <FileText className="mr-1.5 size-4" /> Documents
          </TabsTrigger>
        </TabsList>

        {/* -------------------------------------------------------- inbox */}
        <TabsContent value="inbox" className="mt-4 space-y-3">
          {unread ? (
            <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()}>
              Mark everything read
            </Button>
          ) : null}
          {notifications.isLoading ? <Loader2 className="size-5 animate-spin" /> : null}
          {(notifications.data ?? []).length === 0 && !notifications.isLoading ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Nothing here yet. Booking updates, payouts and Ashnight announcements land here.
              </CardContent>
            </Card>
          ) : null}
          {(notifications.data ?? []).map((row) => (
            <Card key={row.id} className={row.read_at ? "opacity-70" : "border-primary/40"}>
              <CardContent className="flex items-start gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{row.title}</p>
                    <Badge variant="outline" className="text-[0.6rem] uppercase">
                      {row.kind}
                    </Badge>
                  </div>
                  {row.body ? (
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{row.body}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {!row.read_at ? (
                    <Button size="sm" variant="ghost" onClick={() => markRead.mutate(row.id)}>
                      Mark read
                    </Button>
                  ) : null}
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete notification ${row.title}`}
                    onClick={() => removeNotification.mutate(row.id)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* --------------------------------------------------- complaints */}
        <TabsContent value="complaints" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Raise a complaint</CardTitle>
              <CardDescription>
                Payments in escrow are never released while a complaint about that booking is open.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPLAINT_CATEGORIES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="complaint-subject">Subject</Label>
                <Input
                  id="complaint-subject"
                  value={subject}
                  maxLength={140}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="Specialist didn't arrive for the 4pm visit"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="complaint-body">What happened?</Label>
                <Textarea
                  id="complaint-body"
                  rows={5}
                  maxLength={2000}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Give dates, amounts and anything else that helps us investigate."
                />
              </div>
              <Button onClick={() => void submitComplaint()} disabled={raise.isPending}>
                {raise.isPending ? <Loader2 className="size-4 animate-spin" /> : "Send to support"}
              </Button>
            </CardContent>
          </Card>

          {(complaints.data ?? []).map((row) => (
            <Card key={row.id}>
              <CardContent className="space-y-2 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{row.subject}</p>
                  <Badge variant="outline" className="uppercase">
                    {row.state}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{row.body}</p>
                {row.resolution ? (
                  <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                    <span className="font-medium">Ashnight support: </span>
                    {row.resolution}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Filed {new Date(row.created_at).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ---------------------------------------------------- documents */}
        <TabsContent value="documents" className="mt-4 space-y-3">
          {(documents.data ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Invoices and receipts appear here as soon as you pay for a booking, gift or room.
              </CardContent>
            </Card>
          ) : null}
          {(documents.data ?? []).map((row) => (
            <DocumentCard key={row.id} row={row} />
          ))}
        </TabsContent>
      </Tabs>
    </main>
  );
}

/** A printable GHS invoice or receipt. Print → "Save as PDF" gives a clean file. */
export function DocumentCard({
  row,
  template: templateProp,
}: {
  row: DocumentRow;
  /** Preview override; otherwise the admin's active template is used. */
  template?: DocumentTemplate | undefined;
}) {
  const lines = useMemo(() => documentLines(row), [row]);
  const { active } = useDocumentTemplates();
  const template = templateProp ?? active;
  const printId = `doc-${row.id}-${template.id}`;
  const heading = row.kind === "invoice" ? template.invoiceHeading : template.receiptHeading;

  async function savePdf() {
    try {
      await downloadDocumentPdf({
        row,
        template,
        lines,
        heading,
        stamp: (value) => (value ? formatStamp(value) : "—"),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not build the PDF.");
    }
  }

  /** Print via a hidden frame; if the browser refuses, hand back a PDF file. */
  function print() {
    const node = document.getElementById(printId);
    if (!node) {
      void savePdf();
      return;
    }

    let iframe = document.getElementById(
      "ashnight-print-frame",
    ) as HTMLIFrameElement | null;
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = "ashnight-print-frame";
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.position = "fixed";
      iframe.style.width = "1px";
      iframe.style.height = "1px";
      iframe.style.left = "-1000px";
      iframe.style.top = "-1000px";
      iframe.style.opacity = "0";
      iframe.style.border = "0";
      document.body.appendChild(iframe);
    }

    const win = iframe.contentWindow;
    const doc = win?.document;
    if (!doc || !win || typeof win.print !== "function") {
      void savePdf();
      return;
    }

    doc.open();
    doc.write(
      `<!doctype html><html><head><title>${row.number}</title><style>
        @media print{
          body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
        }
        body{font-family:ui-sans-serif,system-ui,sans-serif;padding:40px;color:#171514}
        h1{font-size:20px;margin:0 0 4px;color:${template.accent}}
        table{width:100%;border-collapse:collapse;margin-top:24px;font-size:13px}
        th,td{padding:8px 6px;border-bottom:1px solid #ddd;text-align:left}
        td:last-child,th:last-child{text-align:right}
        .muted{color:#6b6560;font-size:12px}
        .rule{border:0;border-top:2px solid ${template.accent};margin:14px 0}
        .contact{white-space:pre-line}
      </style></head><body>${node.innerHTML}</body></html>`,
    );
    doc.close();

    // Give the browser a moment to render the frame before printing.
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        void savePdf();
      }
    }, 250);
  }



  return (
    <Card>
      <CardContent className="py-4">
        <div id={printId}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              {template.showLogo ? (
                <BrandMark
                  className="mt-0.5"
                  style={{ width: 44, height: 44, color: template.accent }}
                />
              ) : null}
              <div>
                <h1
                  className="font-display text-lg font-semibold"
                  style={{ color: template.accent }}
                >
                  {template.businessName}
                </h1>
                {template.tagline ? (
                  <p className="muted text-xs text-muted-foreground">{template.tagline}</p>
                ) : null}
                <p className="muted text-xs text-muted-foreground">
                  {heading} · {row.number}
                </p>
              </div>
            </div>

            <div className="text-right text-xs text-muted-foreground">
              {template.contact ? (
                <p className="contact whitespace-pre-line">{template.contact}</p>
              ) : null}
              <p>Issued {formatStamp(row.issued_at)}</p>
              {row.paid_at ? <p>Paid {formatStamp(row.paid_at)}</p> : null}

              {row.paystack_reference ? <p>Ref {row.paystack_reference}</p> : null}
            </div>
          </div>

          <hr className="rule mt-3" style={{ borderTop: `2px solid ${template.accent}` }} />

          <p className="mt-3 text-sm font-medium">{row.title}</p>

          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={`${line.label}-${index}`}>
                  <td>{line.label}</td>
                  <td>{line.quantity}</td>
                  <td>{money(line.amount)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={2}>
                  <strong>Total ({row.currency})</strong>
                </td>
                <td>
                  <strong style={{ color: template.accent }}>{money(row.total)}</strong>
                </td>
              </tr>
            </tbody>
          </table>

          {template.thankYouNote ? (
            <p className="muted mt-3 text-xs text-muted-foreground">{template.thankYouNote}</p>
          ) : null}
          {row.notes ? <p className="muted mt-2 text-xs text-muted-foreground">{row.notes}</p> : null}
          {template.footerNote ? (
            <p className="muted mt-3 border-t border-border pt-2 text-[11px] text-muted-foreground">
              {template.footerNote}
            </p>
          ) : null}
        </div>


        <div className="mt-4 flex gap-2">
          <Button size="sm" variant="outline" onClick={print}>
            <Printer className="size-4" /> Print
          </Button>
          <Button size="sm" variant="ghost" onClick={print}>
            <Download className="size-4" /> Save as PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
