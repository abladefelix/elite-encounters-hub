import { useEffect, useMemo, useState } from "react";
import { Banknote, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useAddons } from "@/lib/addons";
import { useRoomSettings } from "@/lib/room-settings";
import { useServiceCatalog } from "@/lib/service-catalog";
import { money } from "@/lib/types";

export interface QuoteDraft {
  serviceId: string | null;
  serviceName: string;
  hours: number;
  rate: number;
  addons: string[];
  scheduledForIso: string | null;
  notes: string;
  subtotal: number;
  fee: number;
  total: number;
}

/**
 * In-chat payment request flow.
 *
 * - specialist mode: the Doll prices the visit and sends a request to the client.
 * - client mode: the member scopes the visit using the Doll's rate; the Doll must
 *   acknowledge before the member can pay into escrow.
 */
export function QuoteDialog({
  mode = "specialist",
  peerName,
  defaultRate,
  open,
  onOpenChange,
  pending,
  onConfirm,
}: {
  mode?: "specialist" | "client";
  peerName: string;
  defaultRate: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending?: boolean;
  onConfirm: (draft: QuoteDraft) => void;
}) {
  const { platform } = useRoomSettings();
  const { activeServices } = useServiceCatalog();
  const { activeAddons } = useAddons();
  const feePct = platform.platformFeePct;
  const isClient = mode === "client";

  const [serviceId, setServiceId] = useState("");
  const [hours, setHours] = useState("3");
  const [rate, setRate] = useState(String(defaultRate || 0));
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [scheduledFor, setScheduledFor] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    if (!serviceId && activeServices[0]) setServiceId(activeServices[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeServices]);

  const service = activeServices.find((item) => item.id === serviceId);

  /**
   * The rate is the Doll's hourly rate; when it isn't set we fall back to the
   * service catalogue rate so the client can still see a live total.
   */
  useEffect(() => {
    if (!open) return;
    const resolved = defaultRate || service?.suggestedRate || 0;
    if (isClient) {
      setRate(String(resolved));
      return;
    }
    setRate((current) => (Number(current) >= 1 ? current : String(resolved)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultRate, isClient, service?.id]);

  const chosenAddons = useMemo(
    () => activeAddons.filter((addon) => addonIds.includes(addon.id)),
    [activeAddons, addonIds],
  );

  const hoursNum = Number(hours);
  const rateNum = Number(rate);
  const addonsAmount = chosenAddons.reduce((sum, addon) => sum + addon.price, 0);
  const subtotal =
    Number.isFinite(hoursNum) && Number.isFinite(rateNum) ? hoursNum * rateNum + addonsAmount : 0;
  const fee = Math.round(subtotal * (feePct / 100));
  const total = subtotal + fee;

  function submit() {
    if (!service) {
      setError("Choose the service you're quoting for.");
      return;
    }
    if (!Number.isFinite(hoursNum) || hoursNum < 0.5 || hoursNum > 24) {
      setError("Hours must be between 0.5 and 24.");
      return;
    }
    if (!Number.isFinite(rateNum) || rateNum < 1) {
      setError(isClient ? "This Doll hasn't set an hourly rate yet." : "Enter the hourly rate in GHS.");
      return;
    }
    let scheduledForIso: string | null = null;
    if (scheduledFor) {
      const parsed = new Date(scheduledFor);
      if (Number.isNaN(parsed.getTime())) {
        setError("That visit date and time could not be read.");
        return;
      }
      scheduledForIso = parsed.toISOString();
    }
    setError("");
    onConfirm({
      serviceId: service.id,
      serviceName: service.label,
      hours: hoursNum,
      rate: Math.round(rateNum),
      addons: chosenAddons.map((addon) => addon.label),
      scheduledForIso,
      notes: notes.trim(),
      subtotal,
      fee,
      total,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {isClient ? "Request to pay" : "Request payment"}
          </DialogTitle>
          <DialogDescription>
            {isClient
              ? `Scope the visit for ${peerName}. They confirm first — then you pay into Ashnight escrow.`
              : `Price the visit for ${peerName}. They approve and pay — Ashnight escrow holds the money until the job is confirmed.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Service</Label>
            <Select value={serviceId} onValueChange={setServiceId} disabled={isClient && activeServices.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a service" />
              </SelectTrigger>
              <SelectContent>
                {activeServices.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label} · {money(item.suggestedRate)}/h
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeServices.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No services are live right now — Ashnight has to publish the catalogue first.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="quote-hours">Hours</Label>
              <Input
                id="quote-hours"
                type="number"
                min={0.5}
                max={24}
                step={0.5}
                value={hours}
                onChange={(event) => setHours(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quote-rate">Rate (GHS/hour)</Label>
              <Input
                id="quote-rate"
                type="number"
                min={1}
                step={1}
                value={rate}
                disabled={isClient}
                onChange={(event) => setRate(event.target.value)}
              />
            </div>
          </div>

          {activeAddons.length ? (
            <div className="space-y-2">
              <Label>Add-ons</Label>
              <div className="space-y-2 rounded-lg border border-border bg-background/40 p-3">
                {activeAddons.map((addon) => (
                  <label key={addon.id} className="flex items-start gap-2.5 text-sm">
                    <Checkbox
                      checked={addonIds.includes(addon.id)}
                      onCheckedChange={(checked) =>
                        setAddonIds((current) =>
                          checked ? [...current, addon.id] : current.filter((id) => id !== addon.id),
                        )
                      }
                    />
                    <span className="min-w-0">
                      <span className="font-medium">{addon.label}</span>{" "}
                      <span className="text-muted-foreground">· {money(addon.price)}</span>
                      {addon.hint ? (
                        <span className="block text-xs text-muted-foreground">{addon.hint}</span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="quote-when">Proposed visit (optional)</Label>
            <Input
              id="quote-when"
              type="datetime-local"
              value={scheduledFor}
              onChange={(event) => setScheduledFor(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quote-notes">Notes {isClient ? "for the Doll" : "for the client"} (optional)</Label>
            <Textarea
              id="quote-notes"
              rows={3}
              maxLength={600}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={
                isClient
                  ? "Access needs, preferred items, anything the Doll should know…"
                  : "What's included, what you'll bring, access needs…"
              }
            />
          </div>

          <Separator />

          <dl className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>{money(subtotal)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Ashnight fee ({feePct}%)</dt>
              <dd>{money(fee)}</dd>
            </div>
            <div className="flex items-center justify-between font-semibold">
              <dt>{isClient ? "You pay" : "Client pays"}</dt>
              <dd>{money(total)}</dd>
            </div>
            {isClient ? null : (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <dt>You receive after release</dt>
                <dd>{money(subtotal)}</dd>
              </div>
            )}
          </dl>

          <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-accent" />
            Never ask for payment outside Ashnight — escrow is the only protection you and the other member
            have.
          </p>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="brass" disabled={pending} onClick={submit}>
            <Banknote className="size-4" /> {isClient ? "Request to pay" : "Send request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
