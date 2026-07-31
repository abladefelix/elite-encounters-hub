import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DoorOpen, Lock, Minus, Phone, Plus, Unlock, Video } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { rooms, roomDistribution } from "@/lib/mock-data";
import { useRoomSettings } from "@/lib/room-settings";

import { money, type Tier } from "@/lib/types";

export const Route = createFileRoute("/admin/rooms")({
  head: () => ({
    meta: [
      { title: "Room Management | Ashnight Admin" },
      {
        name: "description",
        content:
          "Control Ashnight's Basic, Premium and Ultimate rooms: seat capacity, membership pricing, visit fee ranges and intake status.",
      },
      { property: "og:title", content: "Room Management | Ashnight Admin" },
      {
        property: "og:description",
        content: "Open or close intake, adjust seats and review room economics.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminRooms,
});

function AdminRooms() {
  const distribution = roomDistribution();
  const [seats, setSeats] = useState<Record<Tier, number>>(
    () =>
      Object.fromEntries(rooms.map((room) => [room.id, room.seatsLeft])) as Record<
        Tier,
        number
      >,
  );
  const [open, setOpen] = useState<Record<Tier, boolean>>(
    () =>
      Object.fromEntries(rooms.map((room) => [room.id, room.seatsLeft > 0])) as Record<
        Tier,
        boolean
      >,
  );

  function adjust(room: Tier, delta: number) {
    setSeats((current) => ({ ...current, [room]: Math.max(0, (current[room] ?? 0) + delta) }));
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow text-primary">Capacity</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Room management
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Rooms stay small on purpose. Close intake before quality slips, and only open seats
          once enough specialists are vetted in.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {rooms.map((room) => {
          const stats = distribution.find(
            (item) => item.room === room.name.replace(" Room", ""),
          );
          const filled = Math.max(0, 100 - Math.min(100, (seats[room.id] ?? 0) * 4));
          return (
            <Card key={room.id} className="flex flex-col p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <DoorOpen className="size-4 text-primary" />
                    <h2 className="font-display text-lg font-semibold">{room.name}</h2>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{room.tagline}</p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    open[room.id]
                      ? "border-success/40 text-success"
                      : "border-border text-muted-foreground"
                  }
                >
                  {open[room.id] ? "Open" : "Closed"}
                </Badge>
              </div>

              <Separator className="my-5" />

              <dl className="space-y-2.5 text-sm">
                <Row label="Membership" value={`${money(room.priceMonthly)}/mo`} />
                <Row
                  label="Visit fees"
                  value={`${money(room.visitFeeRange[0])}–${money(room.visitFeeRange[1])}`}
                />
                <Row label="Specialists" value={String(stats?.specialists ?? 0)} />
                <Row label="Members" value={String(stats?.clients ?? 0)} />
              </dl>

              <div className="mt-5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Occupancy</span>
                  <span>{seats[room.id]} seats left</span>
                </div>
                <Progress value={filled} className="mt-2 h-1.5" />
              </div>

              <div className="mt-5 flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => adjust(room.id, -1)}
                  aria-label={`Remove a seat from ${room.name}`}
                >
                  <Minus className="size-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => adjust(room.id, 1)}
                  aria-label={`Add a seat to ${room.name}`}
                >
                  <Plus className="size-4" />
                </Button>
                <div className="ml-auto flex items-center gap-2">
                  {open[room.id] ? (
                    <Unlock className="size-3.5 text-muted-foreground" />
                  ) : (
                    <Lock className="size-3.5 text-muted-foreground" />
                  )}
                  <Switch
                    checked={open[room.id]}
                    onCheckedChange={(checked) => {
                      setOpen((current) => ({ ...current, [room.id]: checked }));
                      toast(
                        checked
                          ? `${room.name} intake opened`
                          : `${room.name} intake closed — waitlist is now collecting`,
                      );
                    }}
                    aria-label={`Toggle intake for ${room.name}`}
                  />
                </div>
              </div>

              <ul className="mt-6 space-y-1.5 text-xs text-muted-foreground">
                {room.perks.slice(0, 4).map((perk) => (
                  <li key={perk}>· {perk}</li>
                ))}
              </ul>
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
