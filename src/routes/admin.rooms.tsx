import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  DoorOpen,
  Lock,
  Minus,
  Palette,
  Phone,
  Plus,
  Unlock,
  Video,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { rooms, roomDistribution } from "@/lib/mock-data";
import {
  PRIVILEGE_GROUPS,
  ROOM_ACCENTS,
  ROOM_ACCENT_IDS,
  formatBookingLimit,
  formatLeadTime,
  roomAccentStyle,
  useRoomSettings,
  type RoomAccentId,
} from "@/lib/room-settings";

import { money, type Tier } from "@/lib/types";

export const Route = createFileRoute("/admin/rooms")({
  head: () => ({
    meta: [
      { title: "Room Management | Ashnight Admin" },
      {
        name: "description",
        content:
          "Control Ashnight's Basic, Premium and Ultimate rooms: seat capacity, membership pricing, per-room privileges, call features and room theme colour.",
      },
      { property: "og:title", content: "Room Management | Ashnight Admin" },
      {
        property: "og:description",
        content:
          "Open or close intake, set which features each subscription unlocks and pick each room's theme colour.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminRooms,
});

const ICONS: Partial<Record<string, LucideIcon>> = {
  audio: Phone,
  video: Video,
};

function AdminRooms() {
  const distribution = roomDistribution();
  const { policy, profiles, platform, setPrivilege, setProfileField, setPlatformField, resetPolicy } =
    useRoomSettings();

  function adjust(room: Tier, delta: number) {
    setProfileField(room, "seatsLeft", Math.max(0, (profiles[room]?.seatsLeft ?? 0) + delta));
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-primary">Capacity & privileges</p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Room management
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Everything about a room is editable here — name, tagline, membership price, visit fee
            range, seats, intake, privileges, limits and theme colour. Changes apply instantly to
            every member in that room.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            resetPolicy();
            toast("All room settings reset to defaults");
          }}
        >
          Reset to defaults
        </Button>
      </header>

      <Card className="p-6">
        <p className="eyebrow text-primary">Platform-wide controls</p>
        <h2 className="mt-2 font-display text-lg font-semibold">Global settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These override every room. Use them for maintenance windows or commission changes.
        </p>
        <Separator className="my-5" />
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-3">
            <NumberField
              id="platform-fee"
              label="Platform commission (%)"
              suffix="Taken from every booking"
              value={platform.platformFeePct}
              min={0}
              onChange={(value) =>
                setPlatformField("platformFeePct", Math.min(50, Math.max(0, value)))
              }
            />
          </div>
          <div className="space-y-3">
            <FeatureToggle
              label="Booking requests"
              hint="Members can request and pay for cleans."
              checked={platform.bookingsEnabled}
              onChange={(checked) => {
                setPlatformField("bookingsEnabled", checked);
                toast(checked ? "Booking requests enabled" : "Booking requests paused site-wide");
              }}
            />
            <FeatureToggle
              label="Calling (all rooms)"
              hint="Master switch above per-room voice/video."
              checked={platform.callsEnabled}
              onChange={(checked) => {
                setPlatformField("callsEnabled", checked);
                toast(checked ? "Calling enabled" : "Calling disabled site-wide");
              }}
            />
            <FeatureToggle
              label="Member theme choice"
              hint="Let members pick light, dark or system."
              checked={platform.memberThemeChoice}
              onChange={(checked) => {
                setPlatformField("memberThemeChoice", checked);
                toast(checked ? "Members can choose a theme" : "Member theme choice hidden");
              }}
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {rooms.map((room) => {
          const profile = profiles[room.id];
          const stats = distribution.find(
            (item) => item.room === room.name.replace(" Room", ""),
          );
          const privileges = policy[room.id];
          const filled = Math.max(0, 100 - Math.min(100, profile.seatsLeft * 4));
          return (
            <Card
              key={room.id}
              className="flex flex-col border-t-2 p-6"
              style={{ ...roomAccentStyle(privileges.accent), borderTopColor: "var(--room-accent)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <DoorOpen className="size-4" style={{ color: "var(--room-accent)" }} />
                    <h2 className="font-display text-lg font-semibold">{profile.name}</h2>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{profile.tagline}</p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    profile.intakeOpen
                      ? "border-success/40 text-success"
                      : "border-border text-muted-foreground"
                  }
                >
                  {profile.intakeOpen ? "Open" : "Closed"}
                </Badge>
              </div>

              <Separator className="my-5" />

              <div className="space-y-3">
                <p className="eyebrow" style={{ color: "var(--room-accent)" }}>
                  Room details
                </p>
                <TextField
                  id={`${room.id}-name`}
                  label="Room name"
                  value={profile.name}
                  onChange={(value) => setProfileField(room.id, "name", value)}
                />
                <TextField
                  id={`${room.id}-tagline`}
                  label="Tagline"
                  value={profile.tagline}
                  onChange={(value) => setProfileField(room.id, "tagline", value)}
                />
                <NumberField
                  id={`${room.id}-price`}
                  label="Membership (GH₵ / mo)"
                  value={profile.priceMonthly}
                  step={5}
                  onChange={(value) =>
                    setProfileField(room.id, "priceMonthly", Math.max(0, value))
                  }
                />
                <NumberField
                  id={`${room.id}-fee-min`}
                  label="Visit fee min (GH₵)"
                  value={profile.visitFeeMin}
                  step={5}
                  onChange={(value) => setProfileField(room.id, "visitFeeMin", Math.max(0, value))}
                />
                <NumberField
                  id={`${room.id}-fee-max`}
                  label="Visit fee max (GH₵)"
                  value={profile.visitFeeMax}
                  step={5}
                  onChange={(value) => setProfileField(room.id, "visitFeeMax", Math.max(0, value))}
                />
              </div>

              <Separator className="my-5" />

              <dl className="space-y-2.5 text-sm">
                <Row label="Specialists" value={String(stats?.specialists ?? 0)} />
                <Row label="Members" value={String(stats?.clients ?? 0)} />
                <Row label="Bookings" value={formatBookingLimit(privileges.bookingLimit)} />
                <Row label="Scheduling" value={formatLeadTime(privileges.leadTimeHours)} />
              </dl>

              <div className="mt-5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Occupancy</span>
                  <span>{profile.seatsLeft} seats left</span>
                </div>
                <Progress value={filled} className="mt-2 h-1.5" />
              </div>

              <div className="mt-5 flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => adjust(room.id, -1)}
                  aria-label={`Remove a seat from ${profile.name}`}
                >
                  <Minus className="size-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => adjust(room.id, 1)}
                  aria-label={`Add a seat to ${profile.name}`}
                >
                  <Plus className="size-4" />
                </Button>
                <div className="ml-auto flex items-center gap-2">
                  {profile.intakeOpen ? (
                    <Unlock className="size-3.5 text-muted-foreground" />
                  ) : (
                    <Lock className="size-3.5 text-muted-foreground" />
                  )}
                  <Switch
                    checked={profile.intakeOpen}
                    onCheckedChange={(checked) => {
                      setProfileField(room.id, "intakeOpen", checked);
                      toast(
                        checked
                          ? `${profile.name} intake opened`
                          : `${profile.name} intake closed — waitlist is now collecting`,
                      );
                    }}
                    aria-label={`Toggle intake for ${profile.name}`}
                  />
                </div>
              </div>


              <Separator className="my-5" />

              {PRIVILEGE_GROUPS.map((group) => (
                <div key={group.title} className="mb-5 space-y-3">
                  <p className="eyebrow" style={{ color: "var(--room-accent)" }}>
                    {group.title}
                  </p>
                  {group.items.map((item) => {
                    const Icon = ICONS[item.key];
                    return (
                      <FeatureToggle
                        key={item.key}
                        icon={Icon ? <Icon className="size-3.5" /> : null}
                        label={item.label}
                        hint={item.hint}
                        checked={privileges[item.key]}
                        onChange={(checked) => {
                          setPrivilege(room.id, item.key, checked);
                          toast(
                            `${item.label} ${checked ? "enabled" : "disabled"} for ${profile.name}`,
                          );
                        }}
                      />
                    );
                  })}
                </div>
              ))}

              <div className="space-y-3">
                <p className="eyebrow" style={{ color: "var(--room-accent)" }}>
                  Limits
                </p>
                <NumberField
                  id={`${room.id}-bookings`}
                  label="Bookings / month"
                  suffix="0 = unlimited"
                  value={privileges.bookingLimit ?? 0}
                  onChange={(value) =>
                    setPrivilege(room.id, "bookingLimit", value <= 0 ? null : value)
                  }
                />
                <NumberField
                  id={`${room.id}-lead`}
                  label="Booking lead time (h)"
                  value={privileges.leadTimeHours}
                  min={1}
                  onChange={(value) => setPrivilege(room.id, "leadTimeHours", Math.max(1, value))}
                />
                <NumberField
                  id={`${room.id}-support`}
                  label="Support response (h)"
                  value={privileges.supportResponseHours}
                  min={1}
                  onChange={(value) =>
                    setPrivilege(room.id, "supportResponseHours", Math.max(1, value))
                  }
                />
                <NumberField
                  id={`${room.id}-cover`}
                  label="Damage cover (GH₵)"
                  value={privileges.damageCover}
                  step={500}
                  onChange={(value) => setPrivilege(room.id, "damageCover", Math.max(0, value))}
                />
              </div>

              <Separator className="my-5" />

              <div className="space-y-3">
                <p className="eyebrow flex items-center gap-1.5" style={{ color: "var(--room-accent)" }}>
                  <Palette className="size-3.5" /> Room theme colour
                </p>
                <div className="flex flex-wrap gap-2">
                  {ROOM_ACCENT_IDS.map((accent) => (
                    <AccentSwatch
                      key={accent}
                      accent={accent}
                      active={privileges.accent === accent}
                      onSelect={() => {
                        setPrivilege(room.id, "accent", accent);
                        toast(`${profile.name} theme set to ${ROOM_ACCENTS[accent].label}`);
                      }}
                    />
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Colours the room's badges and cards across the member experience.
                </p>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function FeatureToggle({
  icon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon?: React.ReactNode;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2">
        {icon ? <span className="mt-0.5 text-muted-foreground">{icon}</span> : null}
        <div>
          <p className="text-sm font-medium leading-tight">{label}</p>
          {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8"
      />
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  min = 0,
  step = 1,
  suffix,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-sm font-normal text-muted-foreground">
        {label}
        {suffix ? <span className="block text-[11px] opacity-70">{suffix}</span> : null}
      </Label>
      <Input
        id={id}
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-8 w-24 text-right"
      />
    </div>
  );
}

function AccentSwatch({
  accent,
  active,
  onSelect,
}: {
  accent: RoomAccentId;
  active: boolean;
  onSelect: () => void;
}) {
  const entry = ROOM_ACCENTS[accent];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      aria-label={`${entry.label} theme`}
      title={entry.label}
      className="size-7 rounded-full border-2 transition-transform hover:scale-110 aria-pressed:ring-2 aria-pressed:ring-offset-2 aria-pressed:ring-offset-background"
      style={{
        backgroundColor: entry.color,
        borderColor: active ? entry.soft : "transparent",
        ...(active ? { boxShadow: `0 0 0 2px ${entry.soft}` } : {}),
      }}
    />
  );
}
