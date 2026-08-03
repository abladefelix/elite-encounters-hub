/**
 * Real PDF generation for invoices and receipts.
 *
 * Browser print dialogs are unreliable (blocked popups, no print support in
 * mobile app webviews), so "Save as PDF" builds an actual file with jsPDF and
 * downloads it. Print falls back to this too when the print dialog is refused.
 */
import type { DocumentTemplate } from "@/lib/document-templates";
import type { DocumentLine, DocumentRow } from "@/lib/support";
import { money } from "@/lib/types";

function rgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const int = Number.parseInt(full || "1a1a1e", 16);
  if (Number.isNaN(int)) return [26, 26, 30];
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

export interface DocumentPdfInput {
  row: DocumentRow;
  template: DocumentTemplate;
  lines: DocumentLine[];
  heading: string;
  stamp: (value: string | null) => string;
}

export async function downloadDocumentPdf({
  row,
  template,
  lines,
  heading,
  stamp,
}: DocumentPdfInput) {
  const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const accent = rgb(template.accent);
  const doc = new JsPDF({ unit: "pt", format: "a4" });
  const left = 48;
  const right = doc.internal.pageSize.getWidth() - 48;
  let y = 60;

  doc.setFontSize(16);
  doc.setTextColor(...accent);
  doc.text(template.businessName, left, y);

  doc.setFontSize(9);
  doc.setTextColor(110);
  if (template.tagline) {
    y += 14;
    doc.text(template.tagline, left, y);
  }
  y += 14;
  doc.text(`${heading} · ${row.number}`, left, y);

  // Right-hand meta block.
  let metaY = 60;
  const meta = [
    ...(template.contact ? template.contact.split("\n") : []),
    `Issued ${stamp(row.issued_at)}`,
    ...(row.paid_at ? [`Paid ${stamp(row.paid_at)}`] : []),
    ...(row.paystack_reference ? [`Ref ${row.paystack_reference}`] : []),
  ];
  for (const line of meta) {
    doc.text(line, right, metaY, { align: "right" });
    metaY += 12;
  }

  y = Math.max(y, metaY) + 12;
  doc.setDrawColor(...accent);
  doc.setLineWidth(2);
  doc.line(left, y, right, y);

  y += 22;
  doc.setFontSize(11);
  doc.setTextColor(30);
  doc.text(row.title, left, y);

  autoTable(doc, {
    startY: y + 12,
    head: [["Item", "Qty", "Amount"]],
    body: [
      ...lines.map((line) => [line.label, String(line.quantity), money(line.amount)]),
      [`Total (${row.currency})`, "", money(row.total)],
    ],
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: accent, textColor: 255 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    margin: { left, right: 48 },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === lines.length) {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  const table = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  let footY = (table?.finalY ?? y + 40) + 24;
  doc.setFontSize(8.5);
  doc.setTextColor(110);
  const notes = [template.thankYouNote, row.notes, template.footerNote].filter(
    (part): part is string => Boolean(part),
  );
  for (const note of notes) {
    const wrapped = doc.splitTextToSize(note, right - left) as string[];
    doc.text(wrapped, left, footY);
    footY += wrapped.length * 11 + 8;
  }

  doc.save(`${row.number || "ashnight-document"}.pdf`);
}
