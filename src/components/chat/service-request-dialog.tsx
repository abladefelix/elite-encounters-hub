import { useMemo, useState } from "react";
import { CalendarClock, CreditCard, Lock, ShieldCheck } from "lucide-react";

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
import { ADDON_CATALOG, SERVICE_CATALOG } from "@/lib/mock-data";
import { useRoomSettings } from "@/lib/room-settings";
import { bookingTotal, money, type Specialist } from "@/lib/types";

export interface ServiceRequestDraft {
  service: string;
  hours: number;
  addons: string[];
  scheduledFor: string;
  notes: string;
  total: number;
}

type Step = "scope" | "review";

/**
 * The in-chat "Request service" flow: scope the job, review an itemised
 * quote, then authorise payment. Payment is a stub until the provider is
 * connected; the quote maths is the real thing.
 */
export function ServiceRequestDialog({
  specialist,
  open,
  onOpenChange,
  onConfirm,
}: {
  specialist: Specialist;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (draft: ServiceRequestDraft) => void;
}) {
  const { platform } = useRoomSettings();
  const feePct = platform.platformFeePct;
  const [step, setStep] = useState<Step>("scope");
  const [serviceId, setServiceId] = useState<string>(SERVICE_CATALOG[1].id);
  const [hours, setHours] = useState<number>(SERVICE_CATALOG[1].baseHours);
  const [addons, setAddons] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [notes, setNotes] = useState("");

  const service = SERVICE_CATALOG.find((item) => item.id === serviceId)!;

  const quote = useMemo(() => {
    const { subtotal, fee } = bookingTotal({
      hours,
      rate: specialist.hourlyRate,
      platformFeePct: feePct,
    });
    const addonsTotal = ADDON_CATALOG.filter((addon) => addons.includes(addon.id)).reduce(
      (sum, addon) => sum + addon.price,
      0,
    );
    return { subtotal, fee, addonsTotal, total: subtotal + fee + addonsTotal };
  }, [hours, addons, specialist.hourlyRate, feePct]);

  function reset() {
    setStep("scope");
    setAddons([]);
    setNotes("");
  }

  function confirm() {
    onConfirm({
      service: service.label,
      hours,
      addons: ADDON_CATALOG.filter((addon) => addons.includes(addon.id)).map((a) => a.label),
      scheduledFor: date ? `${date} at ${time}` : `Next available slot, ${time}`,
      notes,
      total: quote.total,
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
      <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto border-border/70 bg-surface">
        <DialogHeader>
          <DialogTitle className="font-display">
            {step === "scope" ? "Request a cleaning service" : "Review & pay"}
          </DialogTitle>
          <DialogDescription>
            {step === "scope"
              ? `Scope the job with ${specialist.name}. They confirm before anything is charged.`
              : "Funds are held on-platform and released once you confirm the job is complete."}
          </DialogDescription>
        </DialogHeader>

        {step === "scope" ? (
          <div className="space-y-5">
            <div>
              <Label htmlFor="service">Service</Label>
              <Select
                value={serviceId}
                onValueChange={(value) => {
                  setServiceId(value);
                  const next = SERVICE_CATALOG.find((item) => item.id === value);
                  if (next) setHours(next.baseHours);
                }}
              >
                <SelectTrigger id="service" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_CATALOG.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label} · ~{item.baseHours}h
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                {money(specialist.hourlyRate)}/hr · adjust if the specialist suggests otherwise.
              </p>
            </div>

            <div>
              <Label>Add-ons</Label>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {ADDON_CATALOG.map((addon) => {
                  const checked = addons.includes(addon.id);
                  return (
                    <Label
                      key={addon.id}
                      htmlFor={`addon-${addon.id}`}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-background p-3 text-sm transition-colors has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5"
                    >
                      <Checkbox
                        id={`addon-${addon.id}`}
                        checked={checked}
                        onCheckedChange={(value) =>
                          setAddons((current) =>
                            value === true
                              ? [...current, addon.id]
                              : current.filter((id) => id !== addon.id),
                          )
                        }
                      />
                      <span className="flex-1">{addon.label}</span>
                      <span className="text-xs text-muted-foreground">+{money(addon.price)}</span>
                    </Label>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="date">Preferred date</Label>
                <Input
                  id="date"
                  type="date"
                  className="mt-2"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="time">Start time</Label>
                <Input
                  id="time"
                  type="time"
                  className="mt-2"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                />
              </div>
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
              <p className="font-display text-base font-semibold">{service.label}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarClock className="size-3.5" />
                {date ? `${date} at ${time}` : `Next available slot, ${time}`} · {hours}h with{" "}
                {specialist.name}
              </p>

              <Separator className="my-4" />

              <dl className="space-y-2 text-sm">
                <Line
                  label={`${hours}h × ${money(specialist.hourlyRate)}`}
                  value={money(quote.subtotal)}
                />
                {addons.length ? (
                  <Line
                    label={`Add-ons (${addons.length})`}
                    value={money(quote.addonsTotal)}
                  />
                ) : null}
                <Line label={`Platform fee (${feePct}%)`} value={money(quote.fee)} />
                <Separator className="my-3" />
                <div className="flex items-center justify-between font-display text-base font-semibold">
                  <span>Total held</span>
                  <span>{money(quote.total)}</span>
                </div>
              </dl>
            </div>

            <div className="space-y-3">
              <Label htmlFor="card">Payment method</Label>
              <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3.5">
                <CreditCard className="size-4 text-primary" />
                <span className="text-sm">Visa ending 4242</span>
                <span className="ml-auto text-xs text-muted-foreground">Default</span>
              </div>
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-accent" />
                Held securely and released to {specialist.name.split(" ")[0]} only after you mark
                the job complete. Cancel free up to 24h before the visit.
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
            <Button variant="brass" onClick={() => setStep("review")}>
              Review quote · {money(quote.total)}
            </Button>
          ) : (
            <Button variant="brass" onClick={confirm}>
              <Lock className="size-4" /> Pay {money(quote.total)}
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
