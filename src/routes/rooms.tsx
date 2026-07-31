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
import { money } from "@/lib/types";

const COMPARISON = [
  { feature: "Bookings per month", basic: "2", premium: "6", ultimate: "Unlimited" },
  { feature: "Chat with photo sharing", basic: true, premium: true, ultimate: true },
  { feature: "Voice & video walkthroughs", basic: false, premium: true, ultimate: true },
  { feature: "Scheduling window", basic: "48h ahead", premium: "Next day", ultimate: "Same day" },
  { feature: "Specialist rating floor", basic: "4.5+", premium: "4.8+", ultimate: "4.9+" },
  { feature: "Deep clean & move-out add-ons", basic: false, premium: true, ultimate: true },
  { feature: "Recurring schedules", basic: false, premium: true, ultimate: true },
  { feature: "Key handling", basic: false, premium: false, ultimate: true },
  { feature: "Dedicated account manager", basic: false, premium: false, ultimate: true },
  { feature: "Damage protection", basic: "—", premium: "GH₵1,000", ultimate: "GH₵5,000" },
  { feature: "Support response", basic: "48h", premium: "4h", ultimate: "1h" },
];

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

function RoomsPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      <div className="mx-auto w-full max-w-6xl px-5 py-12">
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">Membership rooms</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Clients join a room through subscription; placement is still confirmed manually by our
          team after vetting. Specialists are placed by experience, quality record and the type of
          work they're cleared for.
        </p>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {rooms.map((room) => (
            <Card
              key={room.id}
              data-featured={room.id === "premium"}
              className="flex flex-col border-border/70 bg-panel p-6 data-[featured=true]:border-primary/40 data-[featured=true]:shadow-elevated"
            >
              <div className="flex items-center justify-between">
                <TierBadge tier={room.id} withRoom />
                {room.id === "premium" ? (
                  <Badge variant="outline" className="rounded-full border-primary/30 text-primary">
                    Most chosen
                  </Badge>
                ) : null}
              </div>

              <p className="mt-5 font-display text-4xl font-semibold">
                {money(room.priceMonthly)}
                <span className="text-sm font-normal text-muted-foreground">/mo</span>
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
                {room.perks.map((perk) => (
                  <li key={perk} className="flex gap-2 text-muted-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
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
          ))}
        </div>

        <Card className="mt-14 overflow-hidden border-border/70 bg-surface">
          <div className="p-6">
            <h2 className="font-display text-xl font-semibold">Full comparison</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Every room includes manual vetting, on-platform payments and dispute handling.
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
                {COMPARISON.map((row) => (
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
