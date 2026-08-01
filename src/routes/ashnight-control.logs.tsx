import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ACTIVITY_AREAS, useActivityLog } from "@/lib/support";

export const Route = createFileRoute("/ashnight-control/logs")({
  head: () => ({
    meta: [
      { title: "Activity log | Ashnight Admin" },
      {
        name: "description",
        content:
          "Investigate sign-ins, payments, escrow movements, moderation hits and admin actions with IP and device detail.",
      },
      { property: "og:title", content: "Activity log | Ashnight Admin" },
      { property: "og:description", content: "Ashnight forensic activity trail." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLogs,
});

const SEVERITIES = ["all", "info", "notice", "warning", "critical"];

const TONE: Record<string, string> = {
  info: "text-muted-foreground border-border",
  notice: "text-primary border-primary/40",
  warning: "text-amber-500 border-amber-500/40",
  critical: "text-destructive border-destructive/40",
};

function AdminLogs() {
  const [area, setArea] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [search, setSearch] = useState("");
  const logs = useActivityLog({ area, severity, search: search.trim() });

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow text-primary">Forensics</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Activity log
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Append-only trail of who did what, from where. Use it when investigating a complaint,
          chargeback or suspicious sign-in.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTIVITY_AREAS.map((value) => (
              <SelectItem key={value} value={value}>
                {value === "all" ? "All areas" : value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEVERITIES.map((value) => (
              <SelectItem key={value} value={value}>
                {value === "all" ? "All severities" : value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Event, actor, target or IP"
          className="w-full sm:max-w-xs"
          aria-label="Search the activity log"
        />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Origin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center">
                    <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : null}
              {(logs.data ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{row.event}</span>
                      <Badge variant="outline" className="text-[0.6rem] uppercase">
                        {row.area}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[0.6rem] uppercase ${TONE[row.severity] ?? ""}`}
                      >
                        {row.severity}
                      </Badge>
                    </div>
                    {row.details && Object.keys(row.details as object).length ? (
                      <pre className="mt-1 max-w-[28rem] overflow-x-auto rounded bg-surface p-2 text-[0.65rem] text-muted-foreground">
                        {JSON.stringify(row.details, null, 1)}
                      </pre>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs">{row.actor_label || "system"}</TableCell>
                  <TableCell className="max-w-[12rem] truncate text-xs">{row.target || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <p>{row.ip || "—"}</p>
                    <p className="max-w-[14rem] truncate">{row.user_agent || ""}</p>
                  </TableCell>
                </TableRow>
              ))}
              {!logs.isLoading && (logs.data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    Nothing logged for these filters.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
