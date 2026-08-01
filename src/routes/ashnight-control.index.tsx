import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { supabase } from "@/integrations/supabase/client";
import { useEscrow } from "@/lib/escrow";
import {
  useAllProfiles,
  useApplications,
  useBookings,
  useMemberships,
  useReports,
} from "@/lib/queries";
import { TIER_LABEL, money, type Tier } from "@/lib/types";

export const Route = createFileRoute("/ashnight-control/")({
  head: () => ({
    meta: [
      { title: "Admin Overview | Ashnight Control Room" },
      {
        name: "description",
        content:
          "Ashnight admin overview: membership status, escrow balances, vetting backlog and room capacity at a glance.",
      },
      { property: "og:title", content: "Ashnight Admin Overview" },
      {
        property: "og:description",
        content: "Memberships, escrow, vetting backlog and room capacity for the Ashnight network.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminOverview,
});

function useThreadCount() {
  return useQuery({
    queryKey: ["thread-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("threads")
        .select("id", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
}

function useRoleMap() {
  return useQuery({
    queryKey: ["all-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw new Error(error.message);
      const map: Record<string, string[]> = {};
      for (const row of data ?? []) {
        (map[row.user_id] ??= []).push(row.role);
      }
      return map;
    },
  });
}

function AdminOverview() {
  const profilesQuery = useAllProfiles();
  const applicationsQuery = useApplications();
  const membershipsQuery = useMemberships();
  const bookingsQuery = useBookings();
  const reportsQuery = useReports();
  const threadCountQuery = useThreadCount();
  const roleMapQuery = useRoleMap();
  const { totals } = useEscrow();

  const profiles = profilesQuery.data ?? [];
  const applications = applicationsQuery.data ?? [];
  const memberships = membershipsQuery.data ?? [];
  const bookings = bookingsQuery.data ?? [];
  const reports = reportsQuery.data ?? [];
  const roleMap = roleMapQuery.data ?? {};

  const pendingVetting = applications.filter(
    (row) => row.status === "pending" || row.status === "in_review",
  ).length;
  const activeMemberships = memberships.filter((row) => row.status === "active").length;
  const specialistProfiles = profiles.filter((row) =>
    (roleMap[row.id] ?? []).includes("specialist"),
  );
  const openDisputes = bookings.filter((row) => row.status === "disputed").length;
  const openReports = reports.filter((row) => row.state === "open").length;

  const profileById = new Map(profiles.map((row) => [row.id, row]));

  const distribution = (["basic", "premium", "ultimate"] as Tier[]).map((tier) => {
    const inRoom = profiles.filter((row) => row.room === tier);
    return {
      room: TIER_LABEL[tier],
      specialists: inRoom.filter((row) => (roleMap[row.id] ?? []).includes("specialist")).length,
      members: inRoom.filter((row) => !(roleMap[row.id] ?? []).includes("specialist")).length,
    };
  });

  const statusCounts = (["requested", "accepted", "paid", "completed", "disputed"] as const).map(
    (status) => ({
      status,
      count: bookings.filter((row) => row.status === status).length,
    }),
  );
  const maxStatusCount = Math.max(1, ...statusCounts.map((row) => row.count));

  const queue = applications
    .filter((row) => row.status === "pending" || row.status === "in_review")
    .slice(0, 4);

  const loading =
    profilesQuery.isLoading ||
    applicationsQuery.isLoading ||
    membershipsQuery.isLoading ||
    bookingsQuery.isLoading;

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
            Review {pendingVetting} applications <ArrowUpRight className="size-4" />
          </Link>
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active memberships"
          value={loading ? "—" : String(activeMemberships)}
          hint={`${memberships.length} total memberships`}
          icon={TrendingUp}
          tone="default"
        />
        <StatCard
          label="Escrow held & clearing"
          value={loading ? "—" : money(totals.held + totals.clearing)}
          hint={`${money(totals.disputed)} frozen in disputes`}
          icon={ArrowUpRight}
          tone="success"
        />
        <StatCard
          label="Vetted specialists"
          value={loading ? "—" : String(specialistProfiles.length)}
          hint="Across three rooms"
          icon={Users}
          tone="accent"
        />
        <StatCard
          label="Needs attention"
          value={loading ? "—" : String(pendingVetting + openDisputes + openReports)}
          hint={`${pendingVetting} vetting · ${openDisputes} disputes · ${openReports} reports`}
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
                <h2 className="font-display text-base font-semibold">Bookings by status</h2>
                <p className="text-xs text-muted-foreground">
                  {bookings.length} booking{bookings.length === 1 ? "" : "s"} total ·{" "}
                  {threadCountQuery.data ?? 0} open threads
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 flex h-48 items-end gap-3 sm:gap-5">
            {statusCounts.map((point) => (
              <div
                key={point.status}
                className="flex h-full flex-1 flex-col items-center justify-end gap-2"
              >
                <span className="text-[10px] text-muted-foreground">{point.count}</span>
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-primary/25 to-primary"
                  style={{ height: `${(point.count / maxStatusCount) * 82}%` }}
                />
                <span className="text-[11px] capitalize text-muted-foreground">
                  {point.status}
                </span>
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
                ? Math.min(100, (row.specialists / Math.max(1, row.members)) * 100)
                : 0;
              return (
                <div key={row.room}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{row.room}</span>
                    <span className="text-xs text-muted-foreground">
                      {row.specialists} specialists · {row.members} members
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
          {queue.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Nothing waiting for review.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border/60">
              {queue.map((applicant) => (
                <li key={applicant.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{applicant.full_name}</p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {applicant.applied_role} · {applicant.city}
                    </p>
                  </div>
                  <TierBadge tier={applicant.suggested_room} showIcon />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Latest bookings</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/ashnight-control/bookings">Open</Link>
            </Button>
          </div>
          {bookings.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No bookings yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border/60">
              {bookings.slice(0, 4).map((booking) => (
                <li key={booking.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{booking.service_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {profileById.get(booking.specialist_id)?.display_name ?? "—"} ·{" "}
                      {booking.scheduled_for
                        ? new Date(booking.scheduled_for).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                          })
                        : "unscheduled"}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium">
                    {money(booking.hours * booking.rate)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
