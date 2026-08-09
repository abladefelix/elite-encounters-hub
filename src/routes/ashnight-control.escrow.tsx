import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Filter,
  Gift,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  ShieldCheck,
  Timer,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataPager, usePaged } from "@/components/ui/data-pager";
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
  type EscrowEntry,
  type EscrowSettings,
  type EscrowState,
} from "@/lib/escrow";
import { useRoomSettings } from "@/lib/room-settings";
import type { RoomGiftRules } from "@/lib/gifts";
import { useAllProfiles } from "@/lib/queries";
import { money, type Tier } from "@/lib/types";
import { formatStamp } from "@/lib/utils";


export const Route = createFileRoute("/ashnight-control/escrow")({
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
  pending: "border-border text-muted-foreground",
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
    openManual,
  } = useEscrow();
  const {
    gifts,
    platform,
    roomIds,
    profileOf,
    giftRulesOf,
    setGiftField,
    setRoomGiftField,
    toggleRoomGift,
    addGift,
    removeGift,
  } = useRoomSettings();
  const { data: allProfiles } = useAllProfiles();
  const [filter, setFilter] = useState<EscrowState | "all">("all");
  const [search, setSearch] = useState("");
  const [newGift, setNewGift] = useState({ label: "", glyph: "🎁", value: 20, hint: "" });
  const [manual, setManual] = useState({
    clientId: "",
    specialistId: "",
    label: "",
    amount: 0,
    kind: "booking" as EscrowEntry["kind"],
    releaseImmediately: false,
  });

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const profile of allProfiles ?? []) map.set(profile.id, profile.display_name);
    return map;
  }, [allProfiles]);

  const specialistName = (entry: EscrowEntry) =>
    nameById.get(entry.specialist_id) ?? "Unknown specialist";

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filter !== "all" && entry.state !== filter) return false;
      if (!term) return true;
      const haystack = [
        entry.label,
        entry.reference,
        entry.paystack_reference ?? "",
        nameById.get(entry.specialist_id) ?? "",
        nameById.get(entry.client_id) ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [entries, filter, search, nameById]);

  const paged = usePaged(rows, 25);

  function submitGift() {
    const created = addGift({
      label: newGift.label,
      glyph: newGift.glyph,
      value: newGift.value,
      hint: newGift.hint,
    });
    if (!created) return;
    toast.success(`${newGift.label.trim()} added`, {
      description: "Switch it on for the rooms that may send it.",
    });
    setNewGift({ label: "", glyph: "🎁", value: 20, hint: "" });
  }

  async function submitManualEntry() {
    if (!manual.clientId || !manual.specialistId) {
      toast.error("Pick both the member who paid and the specialist being paid.");
      return;
    }
    if (manual.clientId === manual.specialistId) {
      toast.error("The payer and the specialist must be different people.");
      return;
    }
    if (!manual.label.trim()) {
      toast.error("Describe what this payment is for.");
      return;
    }
    if (!Number.isFinite(manual.amount) || manual.amount <= 0) {
      toast.error("Enter an amount above zero.");
      return;
    }
    try {
      await openManual({
        kind: manual.kind,
        clientId: manual.clientId,
        specialistId: manual.specialistId,
        label: manual.label.trim(),
        amount: Math.round(manual.amount),
        feePct: manual.kind === "gift" ? settings.tipFeePct : platform.platformFeePct,
        releaseImmediately: manual.releaseImmediately,
      });
      toast.success("Escrow entry added");
      setManual({
        clientId: "",
        specialistId: "",
        label: "",
        amount: 0,
        kind: "booking",
        releaseImmediately: false,
      });
    } catch {
      /* openManual already surfaced the error */
    }
  }

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

      <PaymentsAutomationCard />

      {/* -------------------------------------------------------- escrow rules */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Escrow rules</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              These apply platform-wide, the moment you change them.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void resetSettings().then(() => toast("Escrow rules reset to Ashnight defaults"));
            }}
          >
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
              onChange={(value) => void setSetting("escrowEnabled", value)}
            />
            <Toggle
              label="Automatic deposits"
              hint="Off means every payout waits for a manual release below."
              value={settings.autoReleaseEnabled}
              onChange={(value) => void setSetting("autoReleaseEnabled", value)}
            />
            <Toggle
              label="Require member confirmation"
              hint="The hold window only starts once the member marks the visit complete."
              value={settings.requireClientConfirm}
              onChange={(value) => void setSetting("requireClientConfirm", value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Hold window (hours)"
              hint="Time in clearing before funds auto-deposit."
              value={settings.holdHours}
              min={0}
              onChange={(value) => void setSetting("holdHours", value)}
            />
            <NumberField
              label="Auto-confirm after (hours)"
              hint="If the member never confirms, the visit is marked complete anyway."
              value={settings.autoConfirmHours}
              min={1}
              onChange={(value) => void setSetting("autoConfirmHours", value)}
            />
            <div className="space-y-1.5">
              <Label className="text-sm">Then set escrow to</Label>
              <Select
                value={settings.autoConfirmAction ?? "release"}
                onValueChange={(value) =>
                  void setSetting("autoConfirmAction", value as "clearing" | "release")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="release">Released — deposit the payout right away</SelectItem>
                  <SelectItem value="clearing">Clearing — start the hold window first</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                What happens to the funds once the auto-confirm deadline passes.
              </p>
            </div>

            <NumberField
              label="Dispute window (hours)"
              hint="How long a member may raise an issue."
              value={settings.disputeWindowHours}
              min={0}
              onChange={(value) => void setSetting("disputeWindowHours", value)}
            />
            <NumberField
              label="Dispute resolution SLA (hours)"
              hint="Target for your trust team to close a case."
              value={settings.disputeSlaHours}
              min={1}
              onChange={(value) => void setSetting("disputeSlaHours", value)}
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
          Gifts sent in chat carry a real cedi value. {money(totals.gifts)} gifted so far.
        </p>

        <Separator className="my-5" />

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <Toggle
              label="Gifts enabled"
              hint="Shows the gift button in every member chat."
              value={settings.tipsEnabled}
              onChange={(value) => void setSetting("tipsEnabled", value)}
            />
            <Toggle
              label="Route gifts through escrow"
              hint="Off means gifts deposit instantly and can't be reversed."
              value={settings.tipsEscrowed}
              onChange={(value) => void setSetting("tipsEscrowed", value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Gift commission (%)"
              hint="Withheld from the specialist's payout."
              value={settings.tipFeePct}
              min={0}
              max={50}
              onChange={(value) => void setSetting("tipFeePct", value)}
            />
            <NumberField
              label="Maximum single gift (GHS)"
              hint="Caps custom amounts in chat."
              value={settings.maxTip}
              min={1}
              onChange={(value) => void setSetting("maxTip", value)}
            />
          </div>
        </div>
      </Card>


      {/* --------------------------------------------------- gift catalogue */}
      <Card className="p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Gift className="size-4 text-primary" /> Gift catalogue &amp; room access
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Set what each gift is worth in cedis, and decide which rooms may send it. Members only
          ever see the gifts their room unlocks.
        </p>

        <Separator className="my-5" />

        <div className="space-y-3">
          {gifts.catalog.map((gift) => (
            <div
              key={gift.id}
              className="grid gap-4 rounded-xl border border-border bg-panel p-4 lg:grid-cols-[1fr_auto]"
            >
              <div className="grid gap-3 sm:grid-cols-[auto_1fr_9rem]">
                <span className="self-center text-2xl leading-none" aria-hidden>
                  {gift.glyph}
                </span>
                <div>
                  <Label htmlFor={`gift-label-${gift.id}`} className="text-xs">
                    Gift name
                  </Label>
                  <Input
                    id={`gift-label-${gift.id}`}
                    className="mt-1.5"
                    value={gift.label}
                    onChange={(event) => setGiftField(gift.id, "label", event.target.value)}
                  />
                  <Input
                    aria-label={`${gift.label} description`}
                    className="mt-2 text-xs"
                    value={gift.hint}
                    placeholder="What this gift says"
                    onChange={(event) => setGiftField(gift.id, "hint", event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor={`gift-value-${gift.id}`} className="text-xs">
                    Cash value (GHS)
                  </Label>
                  <Input
                    id={`gift-value-${gift.id}`}
                    type="number"
                    min={1}
                    className="mt-1.5"
                    value={gift.value}
                    onChange={(event) =>
                      setGiftField(gift.id, "value", Math.max(1, Number(event.target.value) || 1))
                    }
                  />
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Specialist keeps {money(gift.value - (gift.value * settings.tipFeePct) / 100)}
                  </p>
                </div>
              </div>

              <div className="flex flex-col justify-between gap-3 lg:items-end">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${gift.label}`}
                    onClick={() => {
                      removeGift(gift.id);
                      toast(`${gift.label} removed from the catalogue`);
                    }}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={gift.enabled}
                    onCheckedChange={(value) => {
                      setGiftField(gift.id, "enabled", value);
                      toast(`${gift.label} ${value ? "enabled" : "removed from every room"}`);
                    }}
                    aria-label={`${gift.label} enabled`}
                  />
                  {gift.enabled ? "Live" : "Off"}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {roomIds.map((tier) => {
                    const on = giftRulesOf(tier).giftIds.includes(gift.id);
                    return (
                      <Button
                        key={tier}
                        type="button"
                        size="sm"
                        variant={on ? "brass" : "outline"}
                        className="h-7 px-2.5 text-[11px]"
                        onClick={() => toggleRoomGift(tier, gift.id)}
                      >
                        {profileOf(tier).name}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 rounded-xl border border-dashed border-border bg-panel/60 p-4 sm:grid-cols-[4.5rem_1fr_8rem_auto]">
          <div>
            <Label htmlFor="new-gift-glyph" className="text-xs">
              Icon
            </Label>
            <Input
              id="new-gift-glyph"
              className="mt-1.5"
              value={newGift.glyph}
              onChange={(event) => setNewGift((prev) => ({ ...prev, glyph: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="new-gift-label" className="text-xs">
              New gift name
            </Label>
            <Input
              id="new-gift-label"
              className="mt-1.5"
              placeholder="e.g. Brass lantern"
              value={newGift.label}
              onChange={(event) => setNewGift((prev) => ({ ...prev, label: event.target.value }))}
            />
            <Input
              aria-label="New gift description"
              className="mt-2 text-xs"
              placeholder="What this gift says"
              value={newGift.hint}
              onChange={(event) => setNewGift((prev) => ({ ...prev, hint: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="new-gift-value" className="text-xs">
              Cash value (GHS)
            </Label>
            <Input
              id="new-gift-value"
              type="number"
              min={1}
              className="mt-1.5"
              value={newGift.value}
              onChange={(event) =>
                setNewGift((prev) => ({ ...prev, value: Number(event.target.value) }))
              }
            />
          </div>
          <div className="flex items-end">
            <Button variant="brass" onClick={submitGift}>
              <Plus className="size-4" /> Add gift
            </Button>
          </div>
        </div>

        <Separator className="my-6" />

        <h3 className="font-display text-sm font-semibold">Per-room gifting rules</h3>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          {roomIds.map((tier) => (
            <RoomGiftCard
              key={tier}
              tier={tier}
              name={profileOf(tier).name}
              rules={giftRulesOf(tier)}
              count={
                gifts.catalog.filter(
                  (gift) => gift.enabled && giftRulesOf(tier).giftIds.includes(gift.id),
                ).length
              }
              onChange={setRoomGiftField}
            />
          ))}
        </div>
      </Card>

      {/* ------------------------------------------------- manual escrow entry */}
      <Card className="p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Plus className="size-4 text-primary" /> Add an escrow entry
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          For money taken outside the app — a bank transfer or cash on site. The entry follows the
          same hold window and appears in the member's and specialist's ledgers.
        </p>

        <Separator className="my-5" />

        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <Label className="text-xs">Paid by (member)</Label>
            <Select
              value={manual.clientId}
              onValueChange={(value) => setManual((prev) => ({ ...prev, clientId: value }))}
            >
              <SelectTrigger className="mt-1.5" aria-label="Member who paid">
                <SelectValue placeholder="Choose a member" />
              </SelectTrigger>
              <SelectContent>
                {(allProfiles ?? []).map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Paid to (specialist)</Label>
            <Select
              value={manual.specialistId}
              onValueChange={(value) => setManual((prev) => ({ ...prev, specialistId: value }))}
            >
              <SelectTrigger className="mt-1.5" aria-label="Specialist being paid">
                <SelectValue placeholder="Choose a specialist" />
              </SelectTrigger>
              <SelectContent>
                {(allProfiles ?? []).map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select
              value={manual.kind}
              onValueChange={(value) =>
                setManual((prev) => ({ ...prev, kind: value as EscrowEntry["kind"] }))
              }
            >
              <SelectTrigger className="mt-1.5" aria-label="Entry type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="booking">Booking</SelectItem>
                <SelectItem value="gift">Gift</SelectItem>
                <SelectItem value="membership">Membership</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="manual-label" className="text-xs">
              What it's for
            </Label>
            <Input
              id="manual-label"
              className="mt-1.5"
              placeholder="e.g. Deep clean — East Legon"
              value={manual.label}
              onChange={(event) => setManual((prev) => ({ ...prev, label: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="manual-amount" className="text-xs">
              Amount (GHS)
            </Label>
            <Input
              id="manual-amount"
              type="number"
              min={1}
              className="mt-1.5"
              value={manual.amount}
              onChange={(event) =>
                setManual((prev) => ({ ...prev, amount: Number(event.target.value) }))
              }
            />
          </div>
          <div className="flex flex-col justify-end gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                checked={manual.releaseImmediately}
                onCheckedChange={(value) =>
                  setManual((prev) => ({ ...prev, releaseImmediately: value }))
                }
                aria-label="Deposit immediately"
              />
              Deposit immediately (skip the hold window)
            </label>
            <Button variant="brass" onClick={() => void submitManualEntry()}>
              <Plus className="size-4" /> Add entry
            </Button>
          </div>
        </div>
      </Card>

      {/* --------------------------------------------------------------- ledger */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search escrow by payment, member, specialist or reference"
            aria-label="Search escrow ledger"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
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
      </div>

      <Card className="overflow-hidden p-0">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {entries.length === 0
              ? "No escrow activity yet. Payments and gifts sent from a chat thread land here."
              : "No escrow entries match this search."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment</TableHead>
                  <TableHead>Recorded</TableHead>
                  <TableHead>Specialist</TableHead>

                  <TableHead>State</TableHead>
                  <TableHead>Deposits</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Payout</TableHead>
                  <TableHead className="w-56" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.rows.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1.5">
                        {entry.kind === "gift" ? <Gift className="size-3.5 text-primary" /> : null}
                        {entry.label}
                      </span>
                      {entry.payout_request_state === "requested" ? (
                        <Badge
                          variant="outline"
                          className="ml-1 border-accent/40 text-[10px] text-accent"
                        >
                          Release requested
                          {entry.payout_requested_at
                            ? ` · ${relativeTime(entry.payout_requested_at)}`
                            : ""}
                        </Badge>
                      ) : null}
                      <span className="block font-mono text-[11px] text-foreground/80">
                        {entry.reference}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {entry.paystack_reference ? `gateway ${entry.paystack_reference}` : ""}
                        {entry.admin_note ? ` · ${entry.admin_note}` : ""}
                        {entry.dispute_reason ? ` · ${entry.dispute_reason}` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatStamp(entry.created_at)}
                      <span className="block">
                        {entry.paid_at ? `paid ${formatStamp(entry.paid_at)}` : "awaiting payment"}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{specialistName(entry)}</TableCell>

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
                        ? relativeTime(entry.release_at)
                        : entry.state === "released"
                          ? relativeTime(entry.released_at)
                          : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {money(entry.amount)}
                      <span className="block text-xs text-muted-foreground">
                        fee {money(entry.platform_fee)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {money(entry.payout_amount)}
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
                              void resolveDispute(entry.id, "release", "").then(() =>
                                toast.success(`Payout approved for ${specialistName(entry)}`),
                              );
                            }}
                          >
                            <Banknote className="size-4" /> Pay out
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              void resolveDispute(entry.id, "refund", "").then(() =>
                                toast(`${money(entry.amount)} refunded to the member`),
                              );
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
                              void releaseNow(entry.id).then(() =>
                                toast.success(
                                  `${money(entry.payout_amount)} released to ${specialistName(entry)}`,
                                ),
                              );
                            }}
                          >
                            <Banknote className="size-4" /> Release
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              void refund(entry.id).then(() =>
                                toast(`${money(entry.amount)} refunded to the member`),
                              );
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
        {rows.length ? (
          <div className="border-t border-border p-3">
            <DataPager paged={paged} label="escrow entries" />
          </div>
        ) : null}
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

/** Room-level gifting rules: on/off, custom amounts and the cedi range. */
function RoomGiftCard({
  tier,
  name,
  rules,
  count,
  onChange,
}: {
  tier: Tier;
  name: string;
  rules: RoomGiftRules;
  count: number;
  onChange: <K extends keyof RoomGiftRules>(room: Tier, key: K, value: RoomGiftRules[K]) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-sm font-semibold">{name}</p>
          <p className="text-xs text-muted-foreground">{count} gifts available</p>
        </div>
        <Switch
          checked={rules.enabled}
          onCheckedChange={(value) => {
            onChange(tier, "enabled", value);
            toast(`Gifting ${value ? "enabled" : "disabled"} for ${name}`);
          }}
          aria-label={`Gifting enabled for ${name}`}
        />
      </div>

      <label className="mt-4 flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Custom amounts</span>
        <Switch
          checked={rules.allowCustom}
          onCheckedChange={(value) => onChange(tier, "allowCustom", value)}
          aria-label={`Custom gift amounts for ${name}`}
        />
      </label>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`gift-min-${tier}`} className="text-xs">
            Min (GHS)
          </Label>
          <Input
            id={`gift-min-${tier}`}
            type="number"
            min={1}
            className="mt-1.5"
            value={rules.minGift}
            onChange={(event) =>
              onChange(tier, "minGift", Math.max(1, Number(event.target.value) || 1))
            }
          />
        </div>
        <div>
          <Label htmlFor={`gift-max-${tier}`} className="text-xs">
            Max (GHS)
          </Label>
          <Input
            id={`gift-max-${tier}`}
            type="number"
            min={rules.minGift}
            className="mt-1.5"
            value={rules.maxGift}
            onChange={(event) =>
              onChange(tier, "maxGift", Math.max(rules.minGift, Number(event.target.value) || 1))
            }
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Live payment plumbing: the URLs to paste into Paystack and the scheduler,
 * plus a manual trigger for the settlement pass.
 */
function PaymentsAutomationCard() {
  const [running, setRunning] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  async function runNow() {
    setRunning(true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/public/hooks/escrow-release", {
        method: "POST",
        headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {},
      });
      const body = (await res.json()) as {
        ok?: boolean;
        released?: number;
        autoConfirmed?: number;
        skipped?: string | null;
        error?: string;
      };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Settlement failed");
      toast.success(
        body.skipped
          ? body.skipped
          : `${body.released ?? 0} payout(s) deposited, ${body.autoConfirmed ?? 0} moved to clearing`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Settlement failed");
    } finally {
      setRunning(false);
    }
  }

  const rows = [
    {
      label: "Paystack webhook URL",
      hint: "Paste into Paystack → Settings → API Keys & Webhooks.",
      value: `${origin}/api/public/hooks/paystack`,
    },
    {
      label: "Escrow settlement endpoint",
      hint: "Call hourly from your scheduler with the x-ashnight-job-secret header (job trigger secret in the integration vault).",
      value: `${origin}/api/public/hooks/escrow-release`,
    },
  ];

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Payments &amp; automation</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Paystack keys live in <strong>Keys &amp; security</strong> — nothing is stored in code.
            Charges are verified server-side by both the webhook and the member&apos;s return trip,
            and deposits are settled by the scheduled pass below.
          </p>
        </div>
        <Button size="sm" variant="brass" disabled={running} onClick={() => void runNow()}>
          {running ? "Settling…" : "Run settlement now"}
        </Button>
      </div>
      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="rounded-lg border border-border bg-surface p-3">
            <p className="text-sm font-medium">{row.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{row.hint}</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-secondary px-2 py-1.5 text-xs">
                {row.value}
              </code>
              <Button
                size="sm"
                variant="soft"
                onClick={() => {
                  void navigator.clipboard.writeText(row.value);
                  toast.success("Copied");
                }}
              >
                Copy
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
