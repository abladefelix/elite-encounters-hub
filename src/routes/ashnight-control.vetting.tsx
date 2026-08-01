import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, FileSearch, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TierBadge } from "@/components/tier-badge";
import { applicants as seedApplicants } from "@/lib/mock-data";
import type { Applicant, Tier, VettingStatus } from "@/lib/types";

export const Route = createFileRoute("/ashnight-control/vetting")({
  head: () => ({
    meta: [
      { title: "Vetting Queue | Ashnight Admin" },
      {
        name: "description",
        content:
          "Review Ashnight applicants: identity checks, background results, references, and the room each approved member should be placed into.",
      },
      { property: "og:title", content: "Vetting Queue | Ashnight Admin" },
      {
        property: "og:description",
        content: "Approve, hold or decline applicants and assign their room placement.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VettingQueue,
});

const FILTERS: { value: VettingStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_review", label: "In review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Declined" },
];

function VettingQueue() {
  const [rows, setRows] = useState<Applicant[]>(seedApplicants);
  const [filter, setFilter] = useState<VettingStatus | "all">("pending");
  const [selectedId, setSelectedId] = useState<string>(seedApplicants[0]?.id ?? "");

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((row) => row.status === filter)),
    [rows, filter],
  );

  const selected = rows.find((row) => row.id === selectedId) ?? visible[0] ?? rows[0]!;

  function update(id: string, patch: Partial<Applicant>) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function decide(applicant: Applicant, status: VettingStatus) {
    update(applicant.id, { status });
    if (status === "approved") {
      toast.success(
        `${applicant.name} approved into the ${applicant.suggestedRoom} room`,
      );
    } else if (status === "rejected") {
      toast(`${applicant.name} declined — a templated note was queued`);
    } else {
      toast(`${applicant.name} moved to in review`);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow text-primary">Trust &amp; safety</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Vetting queue
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Nobody reaches the platform without a human decision here. Approve an applicant and
          assign the room they belong in.
        </p>
      </header>

      <Tabs value={filter} onValueChange={(value) => setFilter(value as VettingStatus | "all")}>
        <TabsList>
          {FILTERS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
              {item.value !== "all" ? (
                <span className="ml-1.5 text-[10px] text-muted-foreground">
                  {rows.filter((row) => row.status === item.value).length}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="divide-y divide-border/60 p-0">
          {visible.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nothing in this bucket.
            </p>
          ) : (
            visible.map((applicant) => (
              <button
                key={applicant.id}
                onClick={() => setSelectedId(applicant.id)}
                className={`flex w-full flex-wrap items-center gap-3 p-4 text-left transition-colors hover:bg-secondary/50 ${
                  applicant.id === selected.id ? "bg-secondary/70" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{applicant.name}</p>
                    <StatusBadge status={applicant.status} />
                  </div>
                  <p className="mt-1 text-xs capitalize text-muted-foreground">
                    {applicant.role} · {applicant.city} · applied{" "}
                    {new Date(applicant.appliedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <CheckPill ok={applicant.idVerified} label="ID" />
                  <CheckPill
                    ok={applicant.backgroundCheck === "clear"}
                    warn={applicant.backgroundCheck === "flagged"}
                    label="BGC"
                  />
                  <TierBadge tier={applicant.suggestedRoom} />
                </div>
              </button>
            ))
          )}
        </Card>

        <Card className="h-fit p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">{selected.name}</h2>
              <p className="mt-1 text-xs capitalize text-muted-foreground">
                {selected.role} applicant · {selected.city}
              </p>
            </div>
            <StatusBadge status={selected.status} />
          </div>

          <Separator className="my-5" />

          <dl className="space-y-3 text-sm">
            <Row label="Identity verified" value={selected.idVerified ? "Yes" : "Not yet"} />
            <Row
              label="Background check"
              value={
                selected.backgroundCheck === "clear"
                  ? "Clear"
                  : selected.backgroundCheck === "flagged"
                    ? "Flagged — review"
                    : "Pending"
              }
            />
            <Row label="Reference checks" value={`${selected.referenceChecks} of 3 complete`} />
          </dl>

          <div className="mt-5 rounded-lg border border-border bg-panel p-4">
            <p className="flex items-center gap-2 text-xs font-medium">
              <FileSearch className="size-3.5 text-primary" /> Reviewer note
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{selected.note}</p>
          </div>

          <div className="mt-5">
            <label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Room placement
            </label>
            <Select
              value={selected.suggestedRoom}
              onValueChange={(value) =>
                update(selected.id, { suggestedRoom: value as Tier })
              }
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">Basic room</SelectItem>
                <SelectItem value="premium">Premium room</SelectItem>
                <SelectItem value="ultimate">Ultimate room</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {selected.role === "specialist"
                ? "Specialists are placed on experience, references and rating history."
                : "Members are placed by the membership they purchased — override only with a reason."}
            </p>
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <Button variant="brass" onClick={() => decide(selected, "approved")}>
              <Check className="size-4" /> Approve
            </Button>
            <Button variant="secondary" onClick={() => decide(selected, "in_review")}>
              <ShieldAlert className="size-4" /> Hold
            </Button>
            <Button
              variant="ghost"
              className="sm:col-span-2"
              onClick={() => decide(selected, "rejected")}
            >
              <X className="size-4" /> Decline application
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function CheckPill({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) {
  return (
    <span
      className={`hidden items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] sm:inline-flex ${
        warn
          ? "border-destructive/40 text-destructive"
          : ok
            ? "border-success/40 text-success"
            : "border-border text-muted-foreground"
      }`}
    >
      <ShieldCheck className="size-3" />
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: VettingStatus }) {
  const map: Record<VettingStatus, { label: string; className: string }> = {
    pending: { label: "Pending", className: "border-border text-muted-foreground" },
    in_review: { label: "In review", className: "border-warning/40 text-warning" },
    approved: { label: "Approved", className: "border-success/40 text-success" },
    rejected: { label: "Declined", className: "border-destructive/40 text-destructive" },
  };
  const item = map[status];
  return (
    <Badge variant="outline" className={`shrink-0 text-[10px] ${item.className}`}>
      {item.label}
    </Badge>
  );
}
