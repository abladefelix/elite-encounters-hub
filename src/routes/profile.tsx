import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Camera, Heart, ThumbsDown, Sparkles, X, Save, ShieldCheck, LogIn, RefreshCw } from "lucide-react";
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
import { TwoFactorCard } from "@/components/two-factor-card";
import { PortfolioManager } from "@/components/portfolio-manager";

import { useFeatureFlags } from "@/lib/feature-flags";
import { useAuth } from "@/hooks/use-auth";
import {
  resolveStoredMedia,
  useSetSpecialistServices,
  useSpecialistServices,
  useUpdateProfile,
  uploadAvatar,
} from "@/lib/queries";

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

interface EditableFields {
  display_name: string;
  headline: string;
  city: string;
  phone: string;
  bio: string;
  likes: string[];
  dislikes: string[];
  languages: string[];
  hourly_rate: number;
  years_experience: number;
  available: boolean;
}

function toFields(row: {
  display_name: string;
  headline: string;
  city: string;
  phone: string | null;
  bio: string;
  likes: string[];
  dislikes: string[];
  languages: string[];
  hourly_rate: number;
  years_experience: number;
  available: boolean;
}): EditableFields {
  return {
    display_name: row.display_name,
    headline: row.headline,
    city: row.city,
    phone: row.phone ?? "",
    bio: row.bio,
    likes: row.likes,
    dislikes: row.dislikes,
    languages: row.languages,
    hourly_rate: row.hourly_rate,
    years_experience: row.years_experience,
    available: row.available,
  };
}

function ProfilePage() {
  const { user, profile, loading, isSpecialist, refresh } = useAuth();
  const { flags } = useFeatureFlags();
  const { selectableServices, labelOf, isLoading: catalogLoading } = useServiceCatalog();
  const updateProfile = useUpdateProfile();
  const { data: specialistServiceRows } = useSpecialistServices(user?.id);
  const setSpecialistServices = useSetSpecialistServices();
  const fileInput = useRef<HTMLInputElement>(null);

  const [fields, setFields] = useState<EditableFields | null>(null);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setFields(toFields(profile));
    const stored = profile.avatar_url;
    if (!stored) {
      setAvatarUrl(null);
      return;
    }
    let active = true;
    resolveStoredMedia("avatars", stored)
      .then((url) => active && setAvatarUrl(url))
      .catch(() => active && setAvatarUrl(null));
    return () => {
      active = false;
    };
  }, [profile]);


  useEffect(() => {
    if (specialistServiceRows) setServiceIds(specialistServiceRows.map((row) => row.service_id));
  }, [specialistServiceRows]);

  if (loading) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto w-full max-w-5xl px-5 py-16 text-center text-sm text-muted-foreground">
          Loading your profile…
        </div>
        <SiteFooter />
      </div>
    );
  }

  // Signed in, but the profile record hasn't arrived yet (flaky mobile network,
  // cold server function). This must NOT read as "you're signed out".
  if (user && (!profile || !fields)) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-md px-5 py-24 text-center">
          <ShieldCheck className="mx-auto size-10 text-accent" />
          <h1 className="mt-6 font-display text-2xl font-semibold">Loading your profile…</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            You're signed in. We're still fetching your details — tap retry if this takes long.
          </p>
          <Button variant="brass" className="mt-7" onClick={() => void refresh()}>
            <RefreshCw className="size-4" /> Retry
          </Button>
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (!user || !profile || !fields) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-md px-5 py-24 text-center">
          <ShieldCheck className="mx-auto size-10 text-accent" />
          <h1 className="mt-6 font-display text-2xl font-semibold">Sign in to continue</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Your profile is only visible to you once you're signed in to Ashnight.
          </p>
          <Button asChild variant="brass" className="mt-7">
            <Link to="/auth">
              <LogIn className="size-4" /> Sign in
            </Link>
          </Button>
        </div>
        <SiteFooter />
      </div>
    );
  }

  function patch<K extends keyof EditableFields>(key: K, value: EditableFields[K]) {
    setFields((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function onAvatarPicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Image is too large — pick one under 1.5MB");
      return;
    }
    setUploading(true);
    try {
      const path = await uploadAvatar(user.id, file);
      setAvatarUrl(await resolveStoredMedia("avatars", path));
      await updateProfile.mutateAsync({ id: user.id, patch: { avatar_url: path } });

      await refresh();
      toast.success("Profile photo updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't upload that image");
    } finally {
      setUploading(false);
    }
  }

  function toggleService(id: string) {
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  async function saveProfile() {
    if (!user || !fields) return;
    try {
      await updateProfile.mutateAsync({
        id: user.id,
        patch: {
          display_name: fields.display_name,
          headline: fields.headline,
          city: fields.city,
          phone: fields.phone || null,
          bio: fields.bio,
          likes: fields.likes,
          dislikes: fields.dislikes,
          languages: fields.languages,
          hourly_rate: fields.hourly_rate,
          years_experience: fields.years_experience,
          available: fields.available,
        },
      });
      if (isSpecialist) {
        await setSpecialistServices.mutateAsync({ specialistId: user.id, serviceIds });
      }
      await refresh();
      toast.success("Profile saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save your profile");
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <div className="mx-auto w-full max-w-5xl px-5 py-8 md:py-12">
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Your profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Everything here is visible to the members of your room. Changes save when you tap Save.
        </p>

        {/* identity card */}
        <Card className="mt-6 border-border/70 bg-panel p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="relative mx-auto sm:mx-0">
              <Avatar className="size-24 border border-border">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={fields.display_name} /> : null}
                <AvatarFallback className="bg-surface-strong font-display text-xl">
                  {initials(fields.display_name || "Ashnight Member")}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 grid size-9 place-items-center rounded-full border border-border bg-brass text-primary-foreground shadow-elevated transition-transform active:scale-95 disabled:opacity-60"
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
                  {fields.display_name || "Unnamed member"}
                </p>
                {profile.room ? <TierBadge tier={profile.room} showIcon /> : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {fields.headline || "Add a short headline"}
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                <Badge variant="soft" className="rounded-full font-normal capitalize">
                  {isSpecialist ? "Specialist" : "Client"}
                </Badge>
                <Badge variant="soft" className="rounded-full font-normal capitalize">
                  Vetting: {profile.vetting.replace("_", " ")}
                </Badge>
                {profile.verified ? (
                  <Badge variant="soft" className="rounded-full font-normal">
                    ID verified
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
        </Card>

        {/* details */}
        <Card className="mt-5 border-border/70 bg-surface p-5 sm:p-6">
          <h2 className="font-display text-base font-semibold">Details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField
              label="Full name"
              value={fields.display_name}
              onChange={(value) => patch("display_name", value)}
            />
            <TextField
              label="Headline"
              value={fields.headline}
              onChange={(value) => patch("headline", value)}
            />
            <TextField label="City" value={fields.city} onChange={(value) => patch("city", value)} />
            <TextField label="Phone" value={fields.phone} onChange={(value) => patch("phone", value)} />
            {isSpecialist ? (
              <>
                <TextField
                  label="Hourly rate (GHS)"
                  type="number"
                  value={String(fields.hourly_rate)}
                  onChange={(value) => patch("hourly_rate", Number(value) || 0)}
                  hint={`Members see ${money(fields.hourly_rate)} per hour`}
                />
                <TextField
                  label="Years of experience"
                  type="number"
                  value={String(fields.years_experience)}
                  onChange={(value) => patch("years_experience", Number(value) || 0)}
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
              value={fields.bio}
              onChange={(event) => patch("bio", event.target.value)}
              placeholder={
                isSpecialist
                  ? "e.g. 6 years hotel housekeeping, deep cleans and move-outs, insured."
                  : "e.g. 2 bed apartment in East Legon, fortnightly upkeep, two cats."
              }
            />
          </div>

          {isSpecialist ? (
            <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-background px-4 py-3.5">
              <div>
                <p className="text-sm font-medium">Available for new bookings</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Turn off if you're fully booked or on leave.
                </p>
              </div>
              <Switch
                checked={fields.available}
                onCheckedChange={(flag) => patch("available", flag)}
                aria-label="Available for new bookings"
              />
            </div>
          ) : null}
        </Card>

        {/* services rendered — from the admin catalogue */}
        {isSpecialist ? (
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
                const selected = serviceIds.includes(service.id);
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
                      from {money(service.suggestedRate)}/hr
                    </p>
                  </button>
                );
              })}
              {!catalogLoading && selectableServices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No services published yet. Ashnight operations will add them shortly.
                </p>
              ) : null}
            </div>

            {serviceIds.length ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {serviceIds.map((id) => (
                  <Badge key={id} variant="soft" className="rounded-full font-normal">
                    {labelOf(id)}
                  </Badge>
                ))}
              </div>
            ) : null}
          </Card>
        ) : null}

        {/* likes / dislikes */}
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <ChipEditor
            title="Likes"
            hint="Products, routines and habits you prefer."
            icon={Heart}
            values={fields.likes}
            onChange={(likes) => patch("likes", likes)}
            placeholder="e.g. Eco-friendly products"
          />
          <ChipEditor
            title="Dislikes"
            hint="Things to avoid on every visit."
            icon={ThumbsDown}
            values={fields.dislikes}
            onChange={(dislikes) => patch("dislikes", dislikes)}
            placeholder="e.g. Strong bleach smell"
          />
        </div>

        <div className="mt-5 flex justify-end">
          <Button
            variant="brass"
            onClick={saveProfile}
            disabled={updateProfile.isPending || setSpecialistServices.isPending}
            className="w-full sm:w-auto"
          >
            <Save className="size-4" /> Save profile
          </Button>
        </div>

        {/* account security */}
        <TwoFactorCard
          className="mt-8"
          available={flags.twoFactorAvailable}
          required={
            flags.requireTwoFactorForSpecialists && isSpecialist
          }
        />
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
