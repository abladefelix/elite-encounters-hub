import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, Sparkles, PackagePlus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { IconContainer } from "@/components/ui/icon-container";
import { useAddons } from "@/lib/addons";
import { useServiceCatalog } from "@/lib/service-catalog";
import { money } from "@/lib/types";

export const Route = createFileRoute("/ashnight-control/services")({
  component: AdminServicesPage,
});

function AdminServicesPage() {
  const { services, updateService, addService, removeService } = useServiceCatalog();

  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [suggestedRate, setSuggestedRate] = useState("70");


  function create() {
    const name = label.trim();
    if (name.length < 3) {
      toast.error("Give the service a name of at least 3 characters");
      return;
    }
    addService({
      label: name,
      description: description.trim(),
      category: category.trim(),
      suggestedRate: Math.max(0, Number(suggestedRate) || 0),
      active: true,
      specialistSelectable: true,
    });
    setLabel("");
    setDescription("");
    setCategory("");
    toast.success(`${name} published to the catalogue`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <IconContainer icon={Sparkles} />
          <div>
            <h1 className="font-display text-2xl font-semibold">Services catalogue</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              The only place services are created. Specialists pick from this list at registration
              and on their profile; members book them in chat.
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {services.length} service{services.length === 1 ? "" : "s"} in the live catalogue
        </p>
      </div>

      <Card className="border-border/70 bg-panel p-5">
        <h2 className="font-display text-base font-semibold">Add a service</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <Label htmlFor="svc-label" className="text-sm">
              Name
            </Label>
            <Input
              id="svc-label"
              value={label}
              maxLength={60}
              className="mt-2"
              placeholder="e.g. Office end-of-day clean"
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="svc-category" className="text-sm">
              Category
            </Label>
            <Input
              id="svc-category"
              value={category}
              className="mt-2"
              placeholder="e.g. Residential"
              onChange={(event) => setCategory(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="svc-rate" className="text-sm">
              Suggested rate (GHS/hr)
            </Label>
            <Input
              id="svc-rate"
              type="number"
              min={0}
              value={suggestedRate}
              className="mt-2"
              onChange={(event) => setSuggestedRate(event.target.value)}
            />
          </div>
          <div className="md:col-span-4">
            <Label htmlFor="svc-desc" className="text-sm">
              Description
            </Label>
            <Textarea
              id="svc-desc"
              rows={2}
              maxLength={240}
              value={description}
              className="mt-2"
              placeholder="What's included, so specialists and members read the same scope."
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </div>
        <Button variant="brass" className="mt-4" onClick={create}>
          <Plus className="size-4" /> Publish service
        </Button>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {services.map((service) => (
          <Card key={service.id} className="border-border/70 bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-base font-semibold">{service.label}</h3>
                  <Badge variant={service.active ? "soft" : "outline"} className="rounded-full">
                    {service.active ? "Live" : "Hidden"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {service.description || "No description yet."}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${service.label}`}
                onClick={() => {
                  removeService(service.id);
                  toast.message(`${service.label} removed`);
                }}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor={`category-${service.id}`} className="text-xs">
                  Category
                </Label>
                <Input
                  id={`category-${service.id}`}
                  value={service.category ?? ""}
                  className="mt-1.5"
                  placeholder="e.g. Residential"
                  onChange={(event) =>
                    updateService(service.id, { category: event.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor={`rate-${service.id}`} className="text-xs">
                  Suggested rate ({money(service.suggestedRate)}/hr)
                </Label>
                <Input
                  id={`rate-${service.id}`}
                  type="number"
                  min={0}
                  value={service.suggestedRate}
                  className="mt-1.5"
                  onChange={(event) =>
                    updateService(service.id, { suggestedRate: Number(event.target.value) || 0 })
                  }
                />
              </div>
            </div>

            <div className="mt-4">
              <Label htmlFor={`desc-${service.id}`} className="text-xs">
                Description
              </Label>
              <Textarea
                id={`desc-${service.id}`}
                rows={2}
                maxLength={240}
                value={service.description}
                className="mt-1.5"
                onChange={(event) =>
                  updateService(service.id, { description: event.target.value })
                }
              />
            </div>

            <div className="mt-4 divide-y divide-border/70 border-t border-border/70">
              <Row
                label="Live on the platform"
                hint="Hidden services disappear from booking and profiles."
                checked={service.active}
                onChange={(flag) => updateService(service.id, { active: flag })}
              />
              <Row
                label="Selectable at registration"
                hint="Specialists may attach this service to their profile."
                checked={service.specialistSelectable}
                onChange={(flag) => updateService(service.id, { specialistSelectable: flag })}
              />
            </div>
          </Card>
        ))}
      </div>

      <AddonsPanel />
    </div>
  );
}

/**
 * Add-ons catalogue. These are the only extras a member can attach to a
 * booking, and the server prices them from here — so editing a price changes
 * what future bookings actually charge.
 */
function AddonsPanel() {
  const { enabled, items, setEnabled, addAddon, updateAddon, removeAddon } = useAddons();
  const [label, setLabel] = useState("");
  const [price, setPrice] = useState("40");
  const [hint, setHint] = useState("");

  function create() {
    const name = label.trim();
    if (name.length < 3) {
      toast.error("Give the add-on a name of at least 3 characters");
      return;
    }
    const amount = Number(price);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Set a price above zero for the add-on");
      return;
    }
    try {
      addAddon({ label: name, price: Math.round(amount), hint: hint.trim(), active: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add that add-on");
      return;
    }
    setLabel("");
    setHint("");
    toast.success(`${name} added to the booking form`);
  }

  return (
    <Card className="border-border/70 bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <IconContainer icon={PackagePlus} />
          <div>
            <h2 className="font-display text-base font-semibold">Booking add-ons</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Fixed-price extras members tick when requesting a service. Prices here are what the
              checkout charges — members can never type their own.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Show add-ons in booking</span>
          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Enable add-ons" />
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <Label htmlFor="addon-label" className="text-sm">
            Name
          </Label>
          <Input
            id="addon-label"
            value={label}
            maxLength={60}
            className="mt-2"
            placeholder="e.g. Inside fridge"
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="addon-price" className="text-sm">
            Price (GHS)
          </Label>
          <Input
            id="addon-price"
            type="number"
            min={1}
            value={price}
            className="mt-2"
            onChange={(event) => setPrice(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="addon-hint" className="text-sm">
            Short note
          </Label>
          <Input
            id="addon-hint"
            value={hint}
            maxLength={120}
            className="mt-2"
            placeholder="What's included"
            onChange={(event) => setHint(event.target.value)}
          />
        </div>
      </div>
      <Button variant="brass" className="mt-4" onClick={create}>
        <Plus className="size-4" /> Add add-on
      </Button>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {items.length ? (
          items.map((item) => (
            <div key={item.id} className="rounded-lg border border-border/70 bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{item.label}</p>
                    <Badge variant={item.active ? "soft" : "outline"} className="rounded-full">
                      {item.active ? "Live" : "Hidden"}
                    </Badge>
                    <span className="font-display text-sm font-semibold">{money(item.price)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={item.active}
                    onCheckedChange={(flag) => updateAddon(item.id, { active: flag })}
                    aria-label={`${item.label} live`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${item.label}`}
                    onClick={() => {
                      removeAddon(item.id);
                      toast.message(`${item.label} removed`);
                    }}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`addon-price-${item.id}`} className="text-xs">
                    Price (GHS)
                  </Label>
                  <Input
                    id={`addon-price-${item.id}`}
                    type="number"
                    min={0}
                    value={item.price}
                    className="mt-1.5"
                    onChange={(event) =>
                      updateAddon(item.id, { price: Math.max(0, Number(event.target.value) || 0) })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor={`addon-hint-${item.id}`} className="text-xs">
                    Short note
                  </Label>
                  <Input
                    id={`addon-hint-${item.id}`}
                    value={item.hint}
                    maxLength={120}
                    className="mt-1.5"
                    onChange={(event) => updateAddon(item.id, { hint: event.target.value })}
                  />
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            No add-ons yet — members will only see the base service.
          </p>
        )}
      </div>
    </Card>
  );
}


function Row({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}
