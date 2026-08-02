/**
 * Reusable export control for every admin surface.
 *
 * Drop it beside any table with a column map and admins can pull CSV, Excel,
 * PDF or Word. Hidden for admins whose permissions withhold exports.
 */
import { useState } from "react";
import { Download, FileSpreadsheet, FileText, FileType2, Loader2, Table2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminAccess } from "@/lib/admin-permissions";
import { exportRows, type ExportColumn, type ExportFormat } from "@/lib/exporters";

const ICONS: Record<ExportFormat, typeof Download> = {
  csv: Table2,
  xlsx: FileSpreadsheet,
  pdf: FileText,
  doc: FileType2,
};

const LABELS: { id: ExportFormat; label: string }[] = [
  { id: "csv", label: "CSV" },
  { id: "xlsx", label: "Excel (.xlsx)" },
  { id: "pdf", label: "PDF" },
  { id: "doc", label: "Word (.doc)" },
];

interface ExportMenuProps<T> {
  filename: string;
  title: string;
  subtitle?: string;
  columns: ExportColumn<T>[];
  rows: T[];
  label?: string;
  size?: "sm" | "default";
  variant?: "outline" | "secondary" | "ghost";
}

export function ExportMenu<T>({
  filename,
  title,
  subtitle,
  columns,
  rows,
  label = "Export",
  size = "sm",
  variant = "outline",
}: ExportMenuProps<T>) {
  const { canExport } = useAdminAccess();
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  if (!canExport) return null;

  async function run(format: ExportFormat) {
    setBusy(format);
    try {
      await exportRows(format, {
        filename,
        title,
        ...(subtitle ? { subtitle } : {}),
        columns,
        rows,
      });
      toast.success(`${title} exported as ${format.toUpperCase()}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className="gap-2">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {rows.length} row{rows.length === 1 ? "" : "s"} · {title}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LABELS.map((format) => {
          const Icon = ICONS[format.id];
          return (
            <DropdownMenuItem
              key={format.id}
              disabled={busy !== null}
              onSelect={(event) => {
                event.preventDefault();
                void run(format.id);
              }}
              className="gap-2"
            >
              <Icon className="size-4 text-muted-foreground" />
              {format.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
