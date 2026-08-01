import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarClock, Lock, ShieldCheck, Smartphone } from "lucide-react";

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
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useAddons } from "@/lib/addons";
import { useServiceCatalog } from "@/lib/service-catalog";
import { useRoomSettings } from "@/lib/room-settings";
import {
  DEFAULT_PAYSTACK_CHANNEL,
  PAYSTACK_CHANNELS,
  paystackReference,
  type PaystackChannel,
} from "@/lib/paystack";
import { bookingTotal, money } from "@/lib/types";

export interface ServiceRequestDraft {
  serviceId: string | null;
  service: string;
  hours: number;
  /** Labels of the admin-priced add-ons the member chose. */
  addons: string[];
  /** Human-readable schedule, for the chat message. */
  scheduledFor: string;
  /** Exact timestamp for the database, or null when unscheduled. */
  scheduledForIso: string | null;
  notes: string;
  subtotal: number;
  addonsAmount: number;
  fee: number;
  total: number;
  rate: number;
  /** Paystack channel the client chose to pay with. */
  channel: PaystackChannel;
  /** Paystack transaction reference for this request. */
  reference: string;
}

type Step = "scope" | "review";

/**
 * The in-chat "Request service" flow: scope the job against the real active
 * service catalogue, review an itemised quote, then authorise payment.
 * Payment is only *initiated* here — see the escrow entry created by the
 * parent for what actually happens with the money.
 */
export function ServiceRequestDialog({
  specialistName,
  hourlyRate,
  open,
  onOpenChange,
  onConfirm,
}: {
  specialistName: string;
  hourlyRate: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (draft: ServiceRequestDraft) => void;
}) {
  const { platform } = useRoomSettings();
  const { activeServices } = useServiceCatalog();
  const { activeAddons } = useAddons();
  const feePct = platform.platformFeePct;
  const [step, setStep] = useState<Step>("scope");
  const [serviceId, setServiceId] = useState<string>("");
  const [hours, setHours] = useState<number>(3);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [channel, setChannel] = useState<PaystackChannel>(DEFAULT_PAYSTACK_CHANNEL);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!serviceId && activeServices.length) setServiceId(activeServices[0]!.id);
  }, [activeServices, serviceId]);

  const service = activeServices.find((item) => item.id === serviceId);
  const chosenAddons = useMemo(
    () => activeAddons.filter((item) => addonIds.includes(item.id)),
    [activeAddons, addonIds],
  );

  const quote = useMemo(() => {
    const addonsAmount = chosenAddons.reduce((total, item) => total + item.price, 0);
    const { subtotal } = bookingTotal({ hours, rate: hourlyRate, platformFeePct: feePct });
    const base = subtotal + addonsAmount;
    const fee = Math.round(base * (feePct / 100));
    return { labour: subtotal, addonsAmount, subtotal: base, fee, total: base + fee };
  }, [hours, hourlyRate, feePct, chosenAddons]);

  /**
   * Turns the two form fields into a real timestamp. Every failure mode gets a
   * sentence a member can act on — an empty or half-filled schedule must never
   * reach the database as a malformed date.
   */
  function buildSchedule():
    | { ok: true; iso: string | null; label: string }
    | { ok: false; message: string } {
    if (!date && !time) {
      return { ok: true, iso: null, label: "Next available slot" };
    }
    if (!date) {
      return {
        ok: false,
        message: "Pick a preferred date, or clear the start time to request the next available slot.",
      };
    }
    if (!time) {
      return { ok: false, message: "Add a start time for the visit." };
    }
    const stamp = new Date(`${date}T${time}`);
    if (Number.isNaN(stamp.getTime())) {
      return { ok: false, message: "That date and time couldn't be read — please pick them again." };
    }
    if (stamp.getTime() < Date.now() - 60_000) {
      return { ok: false, message: "That slot is in the past. Choose a date and time still to come." };
    }
    return {
      ok: true,
      iso: stamp.toISOString(),
      label: stamp.toLocaleString("en-GH", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  }

  const schedule = buildSchedule();
  const scheduleLabel = schedule.ok ? schedule.label : "Not set yet";

  function reset() {
    setStep("scope");
    setAddonIds([]);
    setNotes("");
    setError(null);
  }

  /** Validates the scope step and only then shows the quote. */
  function review() {
    if (!activeServices.length) {
      setError("No services are published yet — ask support to add one before booking.");
      return;
    }
    if (!service) {
      setError("Choose the service you'd like before continuing.");
      return;
    }
    if (!Number.isFinite(hours) || hours < 1) {
      setError("Set at least one hour for the visit.");
      return;
    }
    if (!hourlyRate || hourlyRate <= 0) {
      setError("This specialist hasn't set an hourly rate yet — message them first.");
      return;
    }
    if (!schedule.ok) {
      setError(schedule.message);
      return;
    }
    setError(null);
    setStep("review");
  }

  function confirm() {
    if (!service) {
      setError("Choose the service you'd like before continuing.");
      setStep("scope");
      return;
    }
    if (!schedule.ok) {
      setError(schedule.message);
      setStep("scope");
      return;
    }
    onConfirm({
      serviceId: service.id,
      service: service.label,
      hours,
      addons: chosenAddons.map((item) => item.label),
      scheduledFor: schedule.label,
      scheduledForIso: schedule.iso,
      notes: notes.trim(),
      subtotal: quote.subtotal,
      addonsAmount: quote.addonsAmount,
      fee: quote.fee,
      total: quote.total,
      rate: hourlyRate,
      channel,
      reference: paystackReference(),
    });
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[88svh] max-w-lg overflow-y-auto border-border/70 bg-surface">
        <DialogHeader>
          <DialogTitle className="font-display">
            {step === "scope" ? "Request an ash service" : "Review & pay"}
          </DialogTitle>
          <DialogDescription>
            {step === "scope"
              ? `Scope the job with ${specialistName}. They confirm before anything is charged.`
              : "Funds are held on-platform and released once you confirm the job is complete."}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
          >
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            {error}
          </p>
        ) : null}

        {step === "scope" ? (
          <div className="space-y-5">
            <div>
              <Label htmlFor="service">Service</Label>
              {activeServices.length ? (
                <Select value={serviceId} onValueChange={setServiceId}>
                  <SelectTrigger id="service" className="mt-2">
                    <SelectValue placeholder="Choose a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeServices.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label} · {money(item.suggestedRate)}/hr
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="mt-2 rounded-lg border border-border bg-panel p-3 text-xs text-muted-foreground">
                  No services are published yet — ask support to add one.
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label>Estimated hours</Label>
                <span className="font-display text-sm font-semibold">{hours}h</span>
              </div>
              <Slider
                className="mt-4"
                min={1}
                max={10}
                step={1}
                value={[hours]}
                onValueChange={([value]) => setHours(value ?? 1)}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {money(hourlyRate)}/hr · adjust if the specialist suggests otherwise.
              </p>
            </div>

            <div>
              <Label>Add-ons (optional)</Label>
              {activeAddons.length ? (
                <div className="mt-2 space-y-2">
                  {activeAddons.map((item) => (
                    <label
                      key={item.id}
                      htmlFor={`addon-${item.id}`}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 bg-panel p-3"
                    >
                      <Checkbox
                        id={`addon-${item.id}`}
                        checked={addonIds.includes(item.id)}
                        onCheckedChange={(checked) =>
                          setAddonIds((current) =>
                            checked
                              ? [...current, item.id]
                              : current.filter((value) => value !== item.id),
                          )
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2 text-sm font-medium">
                          {item.label}
                          <span className="font-display">+{money(item.price)}</span>
                        </span>
                        {item.hint ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {item.hint}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="mt-2 rounded-lg border border-border bg-panel p-3 text-xs text-muted-foreground">
                  No add-ons are published right now.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="date">Preferred date</Label>
                <Input
                  id="date"
                  type="date"
                  className="mt-2"
                  value={date}
                  onChange={(event) => {
                    setDate(event.target.value);
                    setError(null);
                  }}
                />
              </div>
              <div>
                <Label htmlFor="time">Start time</Label>
                <Input
                  id="time"
                  type="time"
                  className="mt-2"
                  value={time}
                  onChange={(event) => {
                    setTime(event.target.value);
                    setError(null);
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Leave both empty to request the next available slot.
              </p>
            </div>

            <div>
              <Label htmlFor="notes">Access notes</Label>
              <Textarea
                id="notes"
                rows={3}
                maxLength={500}
                className="mt-2"
                placeholder="Buzzer code, pets, parking, products to avoid…"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>

            <div className="rounded-lg border border-border bg-panel p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Estimated total</span>
                <span className="font-display text-lg font-semibold">{money(quote.total)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-lg border border-border bg-panel p-4">
              <p className="font-display text-base font-semibold">
                {service?.label ?? "Ash service"}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarClock className="size-3.5" />
                {scheduleLabel} · {hours}h with {specialistName}
              </p>

              <Separator className="my-4" />

              <dl className="space-y-2 text-sm">
                <Line label={`${hours}h × ${money(hourlyRate)}`} value={money(quote.labour)} />
                {chosenAddons.map((item) => (
                  <Line key={item.id} label={item.label} value={money(item.price)} />
                ))}
                <Line label={`Platform fee (${feePct}%)`} value={money(quote.fee)} />
                <Separator className="my-3" />
                <div className="flex items-center justify-between font-display text-base font-semibold">
                  <span>Total held</span>
                  <span>{money(quote.total)}</span>
                </div>
              </dl>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="paystack-channel">Payment method</Label>
                <span className="text-[11px] font-medium text-muted-foreground">
                  Secured by Paystack
                </span>
              </div>
              <Select value={channel} onValueChange={(value) => setChannel(value as PaystackChannel)}>
                <SelectTrigger id="paystack-channel" className="h-auto py-2.5">
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
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Smartphone className="mt-0.5 size-3.5 shrink-0 text-primary" />
                You'll approve the {money(quote.total)} charge in Paystack's secure checkout, in
                Ghana cedis. This request only *initiates* the charge — it stays pending until
                Paystack confirms it.
              </p>
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-accent" />
                Held securely and released to {specialistName.split(" ")[0]} only after you mark
                the job complete.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {step === "review" ? (
            <Button variant="ghost" onClick={() => setStep("scope")}>
              Back
            </Button>
          ) : (
            <span />
          )}
          {step === "scope" ? (
            <Button variant="brass" onClick={review}>
              Review quote · {money(quote.total)}
            </Button>
          ) : (
            <Button variant="brass" onClick={confirm}>
              <Lock className="size-4" /> Pay {money(quote.total)} with Paystack
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <dt>{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
