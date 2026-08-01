import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Camera, Heart, ThumbsDown, Sparkles, X, Save, RotateCcw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { IconContainer } from "@/components/ui/icon-container";
import { TierBadge } from "@/components/tier-badge";
import { useProfile, type MemberProfile } from "@/lib/profile";
import { useServiceCatalog } from "@/lib/service-catalog";
import { initials, money } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your Ashnight Profile — Photo, Preferences & Services" },
      {
        name: "description",
        content:
          "Update your Ashnight profile: photo, bio, likes and dislikes, the services you render and how you'd like to be contacted.",
      },
      { property: "og:title", content: "Your Ashnight Profile" },
      {
        property: "og:description",
        content:
          "Manage your photo, likes and dislikes, services rendered and notification preferences.",
      },
    ],
  }),
  component: ProfilePage,
});

const MAX_AVATAR_BYTES = 1_500_000;

function ProfilePage() {
  const { profile, updateProfile, updatePreference, resetProfile } = useProfile();
  const { selectableServices, labelOf } = useServiceCatalog();
  const fileInput = useRef<HTMLInputElement>(null);

  const isSpecialist = profile.role === "specialist";

  function onAvatarPicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Image is too large — pick one under 1.5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateProfile({ avatar: typeof reader.result === "string" ? reader.result : null });
      toast.success("Profile photo updated");
    };
    reader.onerror = () => toast.error("Couldn't read that image");
    reader.readAsDataURL(file);
  }

  function toggleService(id: string) {
    const next = profile.serviceIds.includes(id)
      ? profile.serviceIds.filter((item) => item !== id)
      : [...profile.serviceIds, id];
    updateProfile({ serviceIds: next });
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <div className="mx-auto w-full max-w-5xl px-5 py-8 md:py-12">
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Your profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Everything here is visible to the members of your room. Changes save as you make them.
        </p>

        {/* identity card */}
        <Card className="mt-6 border-border/70 bg-panel p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="relative mx-auto sm:mx-0">
              <Avatar className="size-24 border border-border">
                {profile.avatar ? <AvatarImage src={profile.avatar} alt={profile.name} /> : null}
                <AvatarFallback className="bg-surface-strong font-display text-xl">
                  {initials(profile.name || "Ashnight Member")}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="absolute -bottom-1 -right-1 grid size-9 place-items-center rounded-full border border-border bg-brass text-primary-foreground shadow-elevated transition-transform active:scale-95"
                aria-label="Upload profile photo"
              >
                <Camera className="size-4" />
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onAvatarPicked}
              />
            </div>

            <div className="min-w-0 flex-1 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <p className="font-display text-lg font-semibold">
                  {profile.name || "Unnamed member"}
                </p>
                <TierBadge tier={profile.room} showIcon />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {profile.headline || "Add a short headline"}
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                {(["client", "specialist"] as const).map((role) => (
                  <Button
                    key={role}
                    size="sm"
                    variant={profile.role === role ? "brass" : "soft"}
                    onClick={() => updateProfile({ role })}
                  >
                    {role === "client" ? "I book cleans" : "I render services"}
                  </Button>
                ))}
              </div>
            </div>

            {profile.avatar ? (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => updateProfile({ avatar: null })}
              >
                Remove photo
              </Button>
            ) : null}
          </div>
        </Card>

        {/* details */}
        <Card className="mt-5 border-border/70 bg-surface p-5 sm:p-6">
          <h2 className="font-display text-base font-semibold">Details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField
              label="Full name"
              value={profile.name}
              onChange={(value) => updateProfile({ name: value })}
            />
            <TextField
              label="Headline"
              value={profile.headline}
              onChange={(value) => updateProfile({ headline: value })}
            />
            <TextField
              label="City"
              value={profile.city}
              onChange={(value) => updateProfile({ city: value })}
            />
            <TextField
              label="Phone"
              value={profile.phone}
              onChange={(value) => updateProfile({ phone: value })}
            />
            <TextField
              label="Email"
              type="email"
              value={profile.email}
              onChange={(value) => updateProfile({ email: value })}
            />
            <TextField
              label="Availability"
              value={profile.availability}
              onChange={(value) => updateProfile({ availability: value })}
            />
            {isSpecialist ? (
              <>
                <TextField
                  label="Hourly rate (GHS)"
                  type="number"
                  value={String(profile.hourlyRate)}
                  onChange={(value) => updateProfile({ hourlyRate: Number(value) || 0 })}
                  hint={`Members see ${money(profile.hourlyRate)} per hour`}
                />
                <TextField
                  label="Years of experience"
                  type="number"
                  value={String(profile.yearsExperience)}
                  onChange={(value) => updateProfile({ yearsExperience: Number(value) || 0 })}
                />
              </>
            ) : null}
          </div>

          <div className="mt-4">
            <Label htmlFor="bio" className="text-sm">
              About you
            </Label>
            <Textarea
              id="bio"
              rows={4}
              maxLength={600}
              className="mt-2"
              value={profile.bio}
              onChange={(event) => updateProfile({ bio: event.target.value })}
              placeholder={
                isSpecialist
                  ? "e.g. 6 years hotel housekeeping, deep cleans and move-outs, insured."
                  : "e.g. 2 bed apartment in East Legon, fortnightly upkeep, two cats."
              }
            />
          </div>
        </Card>

        {/* services rendered — from the admin catalogue */}
        <Card className="mt-5 border-border/70 bg-panel p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <IconContainer icon={Sparkles} />
            <div>
              <h2 className="font-display text-base font-semibold">Services you render</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                The catalogue is set by Ashnight operations — pick the ones you actually cover.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {selectableServices.map((service) => {
              const selected = profile.serviceIds.includes(service.id);
              return (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => toggleService(service.id)}
                  aria-pressed={selected}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-colors",
                    selected
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-background hover:bg-secondary/50",
                  )}
                >
                  <p className="font-display text-sm font-semibold">{service.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{service.description}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    ~{service.baseHours}h · from {money(service.suggestedRate)}/hr
                  </p>
                </button>
              );
            })}
            {selectableServices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No services published yet. Ashnight operations will add them shortly.
              </p>
            ) : null}
          </div>

          {profile.serviceIds.length ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {profile.serviceIds.map((id) => (
                <Badge key={id} variant="soft" className="rounded-full font-normal">
                  {labelOf(id)}
                </Badge>
              ))}
            </div>
          ) : null}
        </Card>

        {/* likes / dislikes */}
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <ChipEditor
            title="Likes"
            hint="Products, routines and habits you prefer."
            icon={Heart}
            values={profile.likes}
            onChange={(likes) => updateProfile({ likes })}
            placeholder="e.g. Eco-friendly products"
          />
          <ChipEditor
            title="Dislikes"
            hint="Things to avoid on every visit."
            icon={ThumbsDown}
            values={profile.dislikes}
            onChange={(dislikes) => updateProfile({ dislikes })}
            placeholder="e.g. Strong bleach smell"
          />
        </div>

        {/* preferences */}
        <Card className="mt-5 border-border/70 bg-surface p-5 sm:p-6">
          <h2 className="font-display text-base font-semibold">Settings</h2>
          <div className="mt-4 divide-y divide-border/70">
            {(
              [
                ["emailUpdates", "Email updates", "Booking confirmations and escrow receipts."],
                ["smsAlerts", "SMS alerts", "Text me when a specialist replies or arrives."],
                ["showOnlineStatus", "Show online status", "Let your room see when you're active."],
                ["allowCalls", "Allow audio & video calls", "Room privileges still apply."],
                [
                  "showProfileInRoom",
                  "Show my profile in the room",
                  "Turn off to browse without being listed.",
                ],
              ] as [keyof MemberProfile["preferences"], string, string][]
            ).map(([key, label, hint]) => (
              <div key={key} className="flex items-center justify-between gap-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
                </div>
                <Switch
                  checked={profile.preferences[key]}
                  onCheckedChange={(flag) => updatePreference(key, flag)}
                  aria-label={label}
                />
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant="brass"
              onClick={() => toast.success("Profile saved")}
              className="flex-1 sm:flex-none"
            >
              <Save className="size-4" /> Save profile
            </Button>
            <Button
              variant="soft"
              onClick={() => {
                resetProfile();
                toast.message("Profile reset to defaults");
              }}
            >
              <RotateCcw className="size-4" /> Reset
            </Button>
          </div>
        </Card>
      </div>

      <SiteFooter />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  hint?: string;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div>
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        maxLength={255}
        className="mt-2"
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ChipEditor({
  title,
  hint,
  icon,
  values,
  onChange,
  placeholder,
}: {
  title: string;
  hint: string;
  icon: LucideIcon;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const value = draft.trim().slice(0, 60);
    if (!value) return;
    if (values.some((item) => item.toLowerCase() === value.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, value]);
    setDraft("");
  }

  return (
    <Card className="border-border/70 bg-panel p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <IconContainer icon={icon} />
        <div>
          <h2 className="font-display text-base font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs"
          >
            {value}
            <button
              type="button"
              onClick={() => onChange(values.filter((item) => item !== value))}
              aria-label={`Remove ${value}`}
              className="text-muted-foreground transition-colors hover:text-destructive"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {values.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing added yet.</p>
        ) : null}
      </div>

      <div className="mt-4 flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder}
          maxLength={60}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button variant="soft" onClick={add}>
          Add
        </Button>
      </div>
    </Card>
  );
}
