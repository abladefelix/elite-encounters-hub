import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Filter,
  Gift,
  RotateCcw,
  ShieldCheck,
  Timer,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
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
import {
  ESCROW_STATE_LABEL,
  relativeTime,
  useEscrow,
  type EscrowSettings,
  type EscrowState,
} from "@/lib/escrow";
import { money } from "@/lib/types";

export const Route = createFileRoute("/admin/escrow")({
  head: () => ({
    meta: [
      { title: "Escrow & Gifts | Ashnight Admin" },
      {
        name: "description",
        content:
          "Control Ashnight's escrow engine: hold windows, automatic deposits, dispute freezes, manual releases and refunds, plus cash gift settings.",
      },
      { property: "og:title", content: "Escrow & Gifts | Ashnight Admin" },
      {
        property: "og:description",
        content:
          "Hold windows, automatic payouts, dispute freezes and cash gift commission — all in one place.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminEscrow,
});

const STATE_STYLE: Record<EscrowState, string> = {
  held: "border-border text-muted-foreground",
  clearing: "border-primary/40 text-primary",
  released: "border-success/40 text-success",
  disputed: "border-destructive/40 text-destructive",
  refunded: "border-accent/40 text-accent",
};

function AdminEscrow() {
  const {
    settings,
    entries,
    totals,
    setSetting,
    resetSettings,
    releaseNow,
    refund,
    resolveDispute,
    clearLedger,
  } = useEscrow();
  const [filter, setFilter] = useState<EscrowState | "all">("all");

  const rows = useMemo(
    () => (filter === "all" ? entries : entries.filter((entry) => entry.state === filter)),
    [entries, filter],
  );

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow text-primary">Trust</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Escrow &amp; gifts
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Every booking payment and escrowed gift is held here. Funds deposit to the specialist
          automatically once the hold window elapses with no issue raised — and you can release,
          refund or freeze any payment by hand at any point.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Held — awaiting confirmation" value={money(totals.held)} icon={ShieldCheck} />
        <Stat label="Clearing — auto-deposit due" value={money(totals.clearing)} icon={Timer} />
        <Stat label="Deposited to specialists" value={money(totals.released)} icon={Banknote} />
        <Stat label="Frozen by disputes" value={money(totals.disputed)} icon={AlertTriangle} />
      </div>

      {/* -------------------------------------------------------- escrow rules */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Escrow rules</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              These apply platform-wide, the moment you change them.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => {
            resetSettings();
            toast("Escrow rules reset to Ashnight defaults");
          }}>
            <RotateCcw className="size-4" /> Reset
          </Button>
        </div>

        <Separator className="my-5" />

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <Toggle
              label="Escrow enabled"
              hint="Off means booking payments settle straight to the specialist."
              value={settings.escrowEnabled}
              onChange={(value) => setSetting("escrowEnabled", value)}
            />
            <Toggle
              label="Automatic deposits"
              hint="Off means every payout waits for a manual release below."
              value={settings.autoReleaseEnabled}
              onChange={(value) => setSetting("autoReleaseEnabled", value)}
            />
            <Toggle
              label="Require member confirmation"
              hint="The hold window only starts once the member marks the visit complete."
              value={settings.requireClientConfirm}
              onChange={(value) => setSetting("requireClientConfirm", value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Hold window (hours)"
              hint="Time in clearing before funds auto-deposit."
              value={settings.holdHours}
              min={0}
              onChange={(value) => setSetting("holdHours", value)}
            />
            <NumberField
              label="Auto-confirm after (hours)"
              hint="If the member never confirms, clearing starts anyway."
              value={settings.autoConfirmHours}
              min={1}
              onChange={(value) => setSetting("autoConfirmHours", value)}
            />
            <NumberField
              label="Dispute window (hours)"
              hint="How long a member may raise an issue."
              value={settings.disputeWindowHours}
              min={0}
              onChange={(value) => setSetting("disputeWindowHours", value)}
            />
            <NumberField
              label="Dispute resolution SLA (hours)"
              hint="Target for your trust team to close a case."
              value={settings.disputeSlaHours}
              min={1}
              onChange={(value) => setSetting("disputeSlaHours", value)}
            />
          </div>
        </div>
      </Card>

      {/* ----------------------------------------------------------- gift rules */}
      <Card className="p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Gift className="size-4 text-primary" /> Cash gifts
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Gifts sent in chat carry a real cedi value. {money(totals.tips)} gifted so far.
        </p>

        <Separator className="my-5" />

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <Toggle
              label="Gifts enabled"
              hint="Shows the gift button in every member chat."
              value={settings.tipsEnabled}
              onChange={(value) => setSetting("tipsEnabled", value)}
            />
            <Toggle
              label="Route gifts through escrow"
              hint="Off means gifts deposit instantly and can't be reversed."
              value={settings.tipsEscrowed}
              onChange={(value) => setSetting("tipsEscrowed", value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Gift commission (%)"
              hint="Withheld from the specialist's payout."
              value={settings.tipFeePct}
              min={0}
              max={50}
              onChange={(value) => setSetting("tipFeePct", value)}
            />
            <NumberField
              label="Maximum single gift (GHS)"
              hint="Caps custom amounts in chat."
              value={settings.maxTip}
              min={1}
              onChange={(value) => setSetting("maxTip", value)}
            />
          </div>
        </div>
      </Card>

      {/* --------------------------------------------------------------- ledger */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="size-4 text-muted-foreground" />
        <Select value={filter} onValueChange={(value) => setFilter(value as EscrowState | "all")}>
          <SelectTrigger className="w-56" aria-label="Filter escrow by state">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All escrow states</SelectItem>
            {(Object.keys(ESCROW_STATE_LABEL) as EscrowState[]).map((state) => (
              <SelectItem key={state} value={state}>
                {ESCROW_STATE_LABEL[state]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {entries.length ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => {
              clearLedger();
              toast("Escrow ledger cleared");
            }}
          >
            Clear ledger
          </Button>
        ) : null}
      </div>

      <Card className="overflow-hidden p-0">
        {entries.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No escrow activity yet. Payments and gifts sent from a chat thread land here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment</TableHead>
                  <TableHead>Specialist</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Deposits</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Payout</TableHead>
                  <TableHead className="w-56" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1.5">
                        {entry.kind === "tip" ? <Gift className="size-3.5 text-primary" /> : null}
                        {entry.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {entry.reference}
                        {entry.note ? ` · ${entry.note}` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{entry.specialistName}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${STATE_STYLE[entry.state]}`}
                      >
                        {ESCROW_STATE_LABEL[entry.state]}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {entry.state === "clearing"
                        ? relativeTime(entry.clearingAt)
                        : entry.state === "released"
                          ? relativeTime(entry.releasedAt)
                          : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {money(entry.gross)}
                      <span className="block text-xs text-muted-foreground">
                        fee {money(entry.fee)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {money(entry.net)}
                    </TableCell>
                    <TableCell>
                      {entry.state === "released" || entry.state === "refunded" ? (
                        <span className="text-xs text-muted-foreground">Settled</span>
                      ) : entry.state === "disputed" ? (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              resolveDispute(entry.id, "release", "");
                              toast.success(`Payout approved for ${entry.specialistName}`);
                            }}
                          >
                            <Banknote className="size-4" /> Pay out
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              resolveDispute(entry.id, "refund", "");
                              toast(`${money(entry.gross)} refunded to the member`);
                            }}
                          >
                            <Undo2 className="size-4" /> Refund
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              releaseNow(entry.id);
                              toast.success(
                                `${money(entry.net)} released to ${entry.specialistName}`,
                              );
                            }}
                          >
                            <Banknote className="size-4" /> Release
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              refund(entry.id);
                              toast(`${money(entry.gross)} refunded to the member`);
                            }}
                          >
                            <Undo2 className="size-4" /> Refund
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Banknote;
}) {
  return (
    <Card className="p-5">
      <p className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </p>
      <p className="mt-3 font-display text-2xl font-semibold">{value}</p>
    </Card>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-background p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={value} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  const id = `escrow-${label.replace(/[^a-z]/gi, "-").toLowerCase()}`;
  return (
    <div>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        className="mt-2"
        min={min}
        {...(max === undefined ? {} : { max })}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.max(min, max === undefined ? next : Math.min(max, next)));
        }}
      />
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

export type { EscrowSettings };
