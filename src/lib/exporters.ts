/**
 * One export pipeline for every admin table.
 *
 * Any admin list can be handed to `exportRows` with a column map and the
 * member picks CSV, Excel, PDF or Word. Heavy libraries load on demand so the
 * control room stays light until someone actually exports.
 */

export type ExportFormat = "csv" | "xlsx" | "pdf" | "doc";

export const EXPORT_FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: "csv", label: "CSV", hint: "Plain data for any tool" },
  { id: "xlsx", label: "Excel (.xlsx)", hint: "Formatted worksheet" },
  { id: "pdf", label: "PDF", hint: "Print-ready report" },
  { id: "doc", label: "Word (.doc)", hint: "Editable document" },
];

export interface ExportColumn<T> {
  label: string;
  /** Cell value. Return "" for blanks — never null. */
  value: (row: T) => string | number;
}

export interface ExportRequest<T> {
  /** File name without extension. */
  filename: string;
  /** Heading printed inside PDF/Word/Excel. */
  title: string;
  /** Optional sub-heading, e.g. the reporting window. */
  subtitle?: string;
  columns: ExportColumn<T>[];
  rows: T[];
}

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function matrix<T>(request: ExportRequest<T>) {
  const head = request.columns.map((column) => column.label);
  const body = request.rows.map((row) =>
    request.columns.map((column) => {
      const value = column.value(row);
      return value === null || value === undefined ? "" : value;
    }),
  );
  return { head, body };
}

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function exportRows<T>(format: ExportFormat, request: ExportRequest<T>) {
  if (!request.rows.length) throw new Error("There's nothing to export in this view yet.");
  const { head, body } = matrix(request);
  const base = `${request.filename}-${stamp()}`;

  if (format === "csv") {
    const csv = [head, ...body].map((line) => line.map(csvCell).join(",")).join("\r\n");
    download(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }), `${base}.csv`);
    return;
  }

  if (format === "xlsx") {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.aoa_to_sheet([
      [request.title],
      ...(request.subtitle ? [[request.subtitle]] : []),
      [],
      head,
      ...body,
    ]);
    sheet["!cols"] = head.map((label, index) => ({
      wch: Math.min(
        44,
        Math.max(label.length + 2, ...body.map((line) => String(line[index] ?? "").length + 2)),
      ),
    }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, request.title.slice(0, 28) || "Export");
    const buffer = XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    download(
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `${base}.xlsx`,
    );
    return;
  }

  if (format === "pdf") {
    const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const landscape = head.length > 6;
    const doc = new JsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt" });
    doc.setFontSize(14);
    doc.text(request.title, 40, 40);
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(
      [request.subtitle, `Ashnight · exported ${new Date().toLocaleString()}`]
        .filter(Boolean)
        .join("  ·  "),
      40,
      58,
    );
    autoTable(doc, {
      head: [head],
      body: body.map((line) => line.map((cell) => String(cell))),
      startY: 74,
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [26, 26, 30], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 244, 241] },
      margin: { left: 40, right: 40 },
    });
    download(doc.output("blob"), `${base}.pdf`);
    return;
  }

  const html = `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeHtml(request.title)}</title>
<style>
body{font-family:Calibri,Arial,sans-serif;font-size:10pt;color:#1a1a1e}
h1{font-size:15pt;margin:0 0 4pt}
p.meta{color:#6b6b70;font-size:8.5pt;margin:0 0 12pt}
table{border-collapse:collapse;width:100%}
th,td{border:0.5pt solid #c9c6bf;padding:4pt 6pt;text-align:left;font-size:8.5pt}
th{background:#1a1a1e;color:#fff}
tr:nth-child(even) td{background:#f5f4f1}
</style></head><body>
<h1>${escapeHtml(request.title)}</h1>
<p class="meta">${[request.subtitle, `Ashnight · exported ${new Date().toLocaleString()}`]
    .filter(Boolean)
    .map((part) => escapeHtml(part as string))
    .join(" &middot; ")}</p>
<table><thead><tr>${head.map((label) => `<th>${escapeHtml(label)}</th>`).join("")}</tr></thead>
<tbody>${body
    .map((line) => `<tr>${line.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></body></html>`;

  download(new Blob([html], { type: "application/msword" }), `${base}.doc`);
}
