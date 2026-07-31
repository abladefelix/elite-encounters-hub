import { useMemo, useState } from "react";
import { Gift as GiftIcon, Lock, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEscrow, escrowSplit } from "@/lib/escrow";
import { GIFT_CATALOG } from "@/lib/gifts";
import {
  DEFAULT_PAYSTACK_CHANNEL,
  PAYSTACK_CHANNELS,
  paystackReference,
  type PaystackChannel,
} from "@/lib/paystack";
import { money, type Specialist } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface GiftDraft {
  giftId: string;
  giftLabel: string;
  glyph: string;
  amount: number;
  net: number;
  channel: PaystackChannel;
  reference: string;
}

/**
 * Send a cash gift from a chat thread. Face value is charged through Paystack;
 * the specialist keeps the value minus the admin-set tip commission.
 */
export function GiftDialog({
  specialist,
  open,
  onOpenChange,
  onConfirm,
}: {
  specialist: Specialist;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (draft: GiftDraft) => void;
}) {
  const { settings } = useEscrow();
  const [giftId, setGiftId] = useState<string>(GIFT_CATALOG[1]!.id);
  const [custom, setCustom] = useState("");
  const [channel, setChannel] = useState<PaystackChannel>(DEFAULT_PAYSTACK_CHANNEL);

  const gift = GIFT_CATALOG.find((item) => item.id === giftId)!;
  const customValue = Number(custom);
  const amount = useMemo(() => {
    const raw = custom.trim() && Number.isFinite(customValue) ? customValue : gift.value;
    return Math.max(1, Math.min(settings.maxTip, Math.round(raw)));
  }, [custom, customValue, gift.value, settings.maxTip]);

  const split = escrowSplit(amount, settings.tipFeePct);
  const firstName = specialist.name.split(" ")[0];

  function confirm() {
    onConfirm({
      giftId: gift.id,
      giftLabel: gift.label,
      glyph: gift.glyph,
      amount,
      net: split.net,
      channel,
      reference: paystackReference(),
    });
    setCustom("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto border-border/70 bg-surface">
        <DialogHeader>
          <DialogTitle className="font-display">Send {firstName} a gift</DialogTitle>
          <DialogDescription>
            Gifts carry real cash value in cedis. {firstName} receives{" "}
            {money(split.net)} of a {money(amount)} gift.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Label>Choose a gift</Label>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {GIFT_CATALOG.map((item) => {
                const active = item.id === giftId && !custom.trim();
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setGiftId(item.id);
                      setCustom("");
                    }}
                    className={cn(
                      "rounded-xl border border-border bg-background p-3 text-center transition-colors hover:border-primary/50",
                      active && "border-primary/60 bg-primary/10",
                    )}
                  >
                    <span className="text-2xl leading-none" aria-hidden>
                      {item.glyph}
                    </span>
                    <span className="mt-2 block text-[11px] font-medium leading-tight">
                      {item.label}
                    </span>
                    <span className="mt-1 block font-display text-xs font-semibold text-primary">
                      {money(item.value)}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{gift.hint}</p>
          </div>

          <div>
            <Label htmlFor="gift-custom">Or set your own amount (GHS)</Label>
            <Input
              id="gift-custom"
              type="number"
              min={1}
              max={settings.maxTip}
              className="mt-2"
              placeholder={`Up to ${money(settings.maxTip)}`}
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="gift-channel">Payment method</Label>
            <Select value={channel} onValueChange={(value) => setChannel(value as PaystackChannel)}>
              <SelectTrigger id="gift-channel" className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYSTACK_CHANNELS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label} — {option.hint}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-border bg-panel p-4 text-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Gift value</span>
              <span className="text-foreground">{money(amount)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-muted-foreground">
              <span>Platform fee ({settings.tipFeePct}%)</span>
              <span className="text-foreground">{money(split.fee)}</span>
            </div>
            <div className="mt-3 flex items-center justify-between font-display text-base font-semibold">
              <span>{firstName} receives</span>
              <span>{money(split.net)}</span>
            </div>
            <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-accent" />
              {settings.tipsEscrowed
                ? `Held in escrow and deposited automatically after ${settings.holdHours}h if no issue is raised.`
                : "Deposited to the specialist straight away — gifts aren't refundable."}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="brass" onClick={confirm}>
            <Lock className="size-4" />
            <GiftIcon className="size-4" /> Send {money(amount)} gift
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
