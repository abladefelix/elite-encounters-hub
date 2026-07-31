import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { TierBadge } from "@/components/tier-badge";
import { rooms } from "@/lib/mock-data";
import {
  formatBookingLimit,
  formatLeadTime,
  formatSupport,
  roomAccentStyle,
  useRoomSettings,
  type RoomPolicyMap,
  type RoomPrivileges,
} from "@/lib/room-settings";
import { money } from "@/lib/types";

export const Route = createFileRoute("/rooms")({
  head: () => ({
    meta: [
      { title: "Membership Rooms — Basic, Premium & Ultimate | Ashnight" },
      {
        name: "description",
        content:
          "Compare Ashnight's Basic, Premium and Ultimate membership rooms: booking limits, video walkthroughs, scheduling windows, damage protection and support.",
      },
      { property: "og:title", content: "Membership Rooms — Basic, Premium & Ultimate" },
      {
        property: "og:description",
        content:
          "Three membership rooms with the same vetting bar and different levels of access to Ashnight's cleaning specialists.",
      },
    ],
  }),
  component: RoomsPage,
});

/** Privileges rendered as the room's feature list, in order of importance. */
function privilegeList(privileges: RoomPrivileges): string[] {
  const list: string[] = [
    `${formatBookingLimit(privileges.bookingLimit)} bookings`,
    formatLeadTime(privileges.leadTimeHours),
    `Support ${formatSupport(privileges.supportResponseHours).toLowerCase()}`,
  ];
  if (privileges.photoSharing) list.push("In-app chat with photo sharing");
  if (privileges.fileSharing) list.push("File sharing — checklists & floor plans");
  if (privileges.audio) list.push("Voice calls with specialists");
  if (privileges.video) list.push("Video walkthrough calls");
  if (privileges.addOns) list.push("Deep clean & move-out add-ons");
  if (privileges.recurringSchedules) list.push("Recurring schedules");
  if (privileges.keyHandling) list.push("Key handling");
  if (privileges.dedicatedManager) list.push("Dedicated account manager");
  if (privileges.damageCover > 0) {
    list.push(`Damage protection up to ${money(privileges.damageCover)}`);
  }
  return list;
}

function comparisonRows(policy: RoomPolicyMap) {
  const value = (pick: (p: RoomPrivileges) => string | boolean) => ({
    basic: pick(policy.basic),
    premium: pick(policy.premium),
    ultimate: pick(policy.ultimate),
  });

  return [
    { feature: "Bookings per month", ...value((p) => formatBookingLimit(p.bookingLimit)) },
    { feature: "Scheduling window", ...value((p) => formatLeadTime(p.leadTimeHours)) },
    { feature: "Chat with photo sharing", ...value((p) => p.photoSharing) },
    { feature: "File sharing", ...value((p) => p.fileSharing) },
    { feature: "Voice calls", ...value((p) => p.audio) },
    { feature: "Video walkthroughs", ...value((p) => p.video) },
    { feature: "Deep clean & move-out add-ons", ...value((p) => p.addOns) },
    { feature: "Recurring schedules", ...value((p) => p.recurringSchedules) },
    { feature: "Key handling", ...value((p) => p.keyHandling) },
    { feature: "Dedicated account manager", ...value((p) => p.dedicatedManager) },
    {
      feature: "Damage protection",
      ...value((p) => (p.damageCover > 0 ? money(p.damageCover) : "—")),
    },
    { feature: "Support response", ...value((p) => formatSupport(p.supportResponseHours)) },
  ];
}

function RoomsPage() {
  const { policy } = useRoomSettings();
  const rows = comparisonRows(policy);

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <div className="mx-auto w-full max-w-6xl px-5 py-12">
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">Membership rooms</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Clients join a room through a paid subscription; placement is still confirmed manually
          by our team after vetting. Each room unlocks a different set of features and privileges.
          Specialists never pay to join — they're placed free of charge by experience, quality
          record and the type of work they're cleared for, and earn from each booking.
        </p>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {rooms.map((room) => {
            const privileges = policy[room.id];
            return (
              <Card
                key={room.id}
                data-featured={room.id === "premium"}
                className="flex flex-col border-border/70 border-t-2 bg-panel p-6 data-[featured=true]:shadow-elevated"
                style={{
                  ...roomAccentStyle(privileges.accent),
                  borderTopColor: "var(--room-accent)",
                }}
              >
                <div className="flex items-center justify-between">
                  <TierBadge tier={room.id} withRoom />
                  {room.id === "premium" ? (
                    <Badge
                      variant="outline"
                      className="rounded-full"
                      style={{
                        color: "var(--room-accent)",
                        borderColor: "color-mix(in oklab, var(--room-accent) 35%, transparent)",
                      }}
                    >
                      Most chosen
                    </Badge>
                  ) : null}
                </div>

                <p className="mt-5 font-display text-4xl font-semibold">
                  {money(room.priceMonthly)}
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Client membership · free for specialists
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{room.tagline}</p>

                <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Users className="size-3.5" /> {room.specialistCount} specialists
                  </span>
                  <span>
                    Visit fees {money(room.visitFeeRange[0])}–{money(room.visitFeeRange[1])}
                  </span>
                  <span>{room.seatsLeft} seats open</span>
                </div>

                <ul className="mt-6 space-y-2.5 text-sm">
                  {privilegeList(privileges).map((perk) => (
                    <li key={perk} className="flex gap-2 text-muted-foreground">
                      <Check
                        className="mt-0.5 size-4 shrink-0"
                        style={{ color: "var(--room-accent)" }}
                      />
                      {perk}
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  variant={room.id === "premium" ? "brass" : "soft"}
                  className="mt-7 w-full"
                >
                  <Link to="/apply">Apply for {room.name.replace(" Room", "")}</Link>
                </Button>
              </Card>
            );
          })}
        </div>

        <Card className="mt-14 overflow-hidden border-border/70 bg-surface">
          <div className="p-6">
            <h2 className="font-display text-xl font-semibold">Full comparison</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Every room includes manual vetting, on-platform payments and dispute handling.
              Prices are client membership fees; specialists join at no cost.
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="min-w-56">Feature</TableHead>
                  <TableHead className="text-center">Basic</TableHead>
                  <TableHead className="text-center">Premium</TableHead>
                  <TableHead className="text-center">Ultimate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.feature}>
                    <TableCell className="font-medium">{row.feature}</TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      <Cell value={row.basic} />
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      <Cell value={row.premium} />
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      <Cell value={row.ultimate} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      <SiteFooter />
    </div>
  );
}

function Cell({ value }: { value: string | boolean }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check className="mx-auto size-4 text-primary" />
    ) : (
      <span className="text-muted-foreground/50">—</span>
    );
  }
  return <span>{value}</span>;
}
