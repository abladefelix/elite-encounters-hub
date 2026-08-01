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
    </div>
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
