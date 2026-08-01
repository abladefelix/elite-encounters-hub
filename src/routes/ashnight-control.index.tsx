import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  DoorOpen,
  TrendingUp,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconContainer } from "@/components/ui/icon-container";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/ui/stat-card";
import { TierBadge } from "@/components/tier-badge";
import {
  adminMetrics,
  applicants,
  bookingTrend,
  bookings,
  getSpecialist,
  roomDistribution,
} from "@/lib/mock-data";
import { money } from "@/lib/types";

export const Route = createFileRoute("/ashnight-control/")({
  head: () => ({
    meta: [
      { title: "Admin Overview | Ashnight Control Room" },
      {
        name: "description",
        content:
          "Ashnight admin overview: membership revenue, booking volume, vetting backlog and room capacity at a glance.",
      },
      { property: "og:title", content: "Ashnight Admin Overview" },
      {
        property: "og:description",
        content: "Revenue, vetting backlog and room capacity for the Ashnight network.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminOverview,
});

function AdminOverview() {
  const metrics = adminMetrics();
  const distribution = roomDistribution();
  const maxGmv = Math.max(...bookingTrend.map((point) => point.gmv));
  const queue = applicants
    .filter((item) => item.status === "pending" || item.status === "in_review")
    .slice(0, 4);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-primary">Control room</p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Network overview
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every membership, specialist and booking on Ashnight, in one place.
          </p>
        </div>
        <Button asChild variant="brass">
          <Link to="/ashnight-control/vetting">
            Review {metrics.pendingVetting} applications <ArrowUpRight className="size-4" />
          </Link>
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Monthly recurring revenue"
          value={money(metrics.mrr)}
          hint={`${metrics.activeSubs} active memberships`}
          icon={TrendingUp}
          tone="default"
          trend={{ value: 12.4, label: "MoM" }}
        />
        <StatCard
          label="Booking volume (GMV)"
          value={money(metrics.gmv)}
          hint={`${metrics.takeRate}% platform take rate`}
          icon={ArrowUpRight}
          tone="success"
          trend={{ value: 18.6, label: "MoM" }}
        />
        <StatCard
          label="Vetted specialists"
          value={String(metrics.specialists)}
          hint="Across three rooms"
          icon={Users}
          tone="accent"
        />
        <StatCard
          label="Needs attention"
          value={String(metrics.pendingVetting + metrics.openDisputes)}
          hint={`${metrics.pendingVetting} in vetting · ${metrics.openDisputes} disputes`}
          icon={AlertTriangle}
          tone="warning"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconContainer icon={TrendingUp} tone="default" size="sm" />
              <div>
                <h2 className="font-display text-base font-semibold">Bookings &amp; GMV</h2>
                <p className="text-xs text-muted-foreground">Last six months</p>
              </div>
            </div>
            <Badge variant="soft" className="text-[10px]">
              +18.6% MoM
            </Badge>
          </div>

          <div className="mt-8 flex h-48 items-end gap-3 sm:gap-5">
            {bookingTrend.map((point) => (
              <div
                key={point.month}
                className="flex h-full flex-1 flex-col items-center justify-end gap-2"
              >
                <span className="text-[10px] text-muted-foreground">
                  {Math.round(point.gmv / 1000)}k
                </span>
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-primary/25 to-primary"
                  style={{ height: `${(point.gmv / maxGmv) * 82}%` }}
                />
                <span className="text-[11px] text-muted-foreground">{point.month}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <IconContainer icon={DoorOpen} tone="accent" size="sm" />
            <h2 className="font-display text-base font-semibold">Room balance</h2>
          </div>
          <div className="mt-6 space-y-5">
            {distribution.map((row) => {
              const ratio = row.specialists
                ? Math.min(100, (row.specialists / Math.max(1, row.clients)) * 100)
                : 0;
              return (
                <div key={row.room}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{row.room}</span>
                    <span className="text-xs text-muted-foreground">
                      {row.specialists} specialists · {row.clients} members
                    </span>
                  </div>
                  <Progress value={ratio} className="mt-2 h-1.5" />
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
            Keep at least one specialist per three members in a room before opening new seats.
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconContainer icon={BadgeCheck} tone="success" size="sm" />
              <h2 className="font-display text-base font-semibold">Vetting queue</h2>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/ashnight-control/vetting">Open</Link>
            </Button>
          </div>
          <ul className="mt-4 divide-y divide-border/60">
            {queue.map((applicant) => (
              <li key={applicant.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{applicant.name}</p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {applicant.role} · {applicant.city}
                  </p>
                </div>
                <TierBadge tier={applicant.suggestedRoom} showIcon />
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Latest bookings</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/ashnight-control/bookings">Open</Link>
            </Button>
          </div>
          <ul className="mt-4 divide-y divide-border/60">
            {bookings.slice(0, 4).map((booking) => (
              <li key={booking.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{booking.service}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {getSpecialist(booking.specialistId)?.name} ·{" "}
                    {new Date(booking.scheduledFor).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                    })}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium">
                  {money(booking.hours * booking.rate)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
