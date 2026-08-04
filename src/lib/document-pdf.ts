/**
 * Real PDF generation for invoices and receipts.
 *
 * Browser print dialogs are unreliable (blocked popups, no print support in
 * mobile app webviews), so "Save as PDF" builds an actual file with jsPDF and
 * downloads it. Print falls back to this too when the print dialog is refused.
 *
 * Two device-specific details matter here:
 *  - jsPDF's built-in fonts have no ₵ glyph, so currency is written as
 *    "GHS 900" instead of Intl's "GH₵900" (which rendered as "GH µ 9 0 0").
 *  - Inside the native shell a normal download is a no-op, so we write the file
 *    to the app cache and hand it to the native share sheet instead.
 */
import type { DocumentTemplate } from "@/lib/document-templates";
import type { DocumentLine, DocumentRow } from "@/lib/support";
import { isNativeApp } from "@/lib/native";

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

/** PDF-safe currency: the embedded fonts have no cedi sign. */
function pdfMoney(amount: number, currency = "GHS") {
  return `${currency} ${Math.round(amount).toLocaleString("en-GH")}`;
}

/** Fetches a logo and returns a data URL jsPDF can embed, or null. */
async function loadLogo(url: string): Promise<{ data: string; format: string } | null> {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (blob.type.includes("svg")) return null; // jsPDF can't embed SVG
    const format = blob.type.includes("jpeg") || blob.type.includes("jpg") ? "JPEG" : "PNG";
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("logo read failed"));
      reader.readAsDataURL(blob);
    });
    return { data, format };
  } catch {
    return null;
  }
}

export interface DocumentPdfInput {
  row: DocumentRow;
  template: DocumentTemplate;
  lines: DocumentLine[];
  heading: string;
  stamp: (value: string | null) => string;
  /** Admin-uploaded logo; falls back to the drawn Ashnight mark. */
  logoUrl?: string | undefined;
}

export async function downloadDocumentPdf({
  row,
  template,
  lines,
  heading,
  stamp,
  logoUrl,
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
  let textLeft = left;

  // ---------------------------------------------------------------- logo
  if (template.showLogo) {
    const logo = logoUrl ? await loadLogo(logoUrl) : null;
    if (logo) {
      doc.addImage(logo.data, logo.format, left, y - 18, 40, 40);
      textLeft = left + 52;
    } else {
      // Vector fallback: the two interlocking brass discs.
      doc.setFillColor(...accent);
      doc.circle(left + 14, y + 6, 13, "F");
      doc.circle(left + 30, y - 6, 6.5, "F");
      doc.setDrawColor(...accent);
      doc.setLineWidth(2);
      doc.circle(left + 30, y - 6, 10, "S");
      textLeft = left + 52;
    }
  }

  doc.setFontSize(16);
  doc.setTextColor(...accent);
  doc.text(template.businessName, textLeft, y);

  doc.setFontSize(9);
  doc.setTextColor(110);
  if (template.tagline) {
    y += 14;
    doc.text(template.tagline, textLeft, y);
  }
  y += 14;
  doc.text(`${heading} · ${row.number}`, textLeft, y);

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
      ...lines.map((line) => [
        line.label,
        String(line.quantity),
        pdfMoney(line.amount, row.currency),
      ]),
      [`Total (${row.currency})`, "", pdfMoney(row.total, row.currency)],
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

  const fileName = `${row.number || "ashnight-document"}.pdf`;

  if (isNativeApp()) {
    await shareNativePdf(doc.output("datauristring"), fileName);
    return;
  }

  doc.save(fileName);
}

/** Writes the PDF into the app cache and opens the native share sheet. */
async function shareNativePdf(dataUri: string, fileName: string) {
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);

  const written = await Filesystem.writeFile({
    path: fileName,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });

  await Share.share({
    title: fileName,
    files: [written.uri],
  });
}
