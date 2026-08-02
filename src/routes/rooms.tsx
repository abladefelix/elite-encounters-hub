import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Check, LogIn, Users } from "lucide-react";

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
import { MemberDashboardStrip } from "@/components/member-dashboard-strip";
import { SiteFooter } from "@/components/site-footer";
import { TierBadge } from "@/components/tier-badge";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useSpecialists, type MembershipRow } from "@/lib/queries";
import {
  formatBookingLimit,
  formatLeadTime,
  formatSupport,
  roomAccentStyle,
  NEW_ROOM_PRIVILEGES,
  useRoomSettings,
  type RoomPolicyMap,
  type RoomPrivileges,
} from "@/lib/room-settings";
import { startMembershipCheckout } from "@/lib/payments.functions";
import { money, tierLabel, type Tier } from "@/lib/types";

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
          "Three membership rooms with the same vetting bar and different levels of access to Ashnight's ash specialists.",
      },
    ],
  }),
  component: RoomsPage,
});

/** The signed-in client's most recent membership row, straight from the database. */
function useMyMembership(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-membership", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as MembershipRow | null;
    },
  });
}

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

interface ComparisonRow {
  feature: string;
  values: (string | boolean)[];
}

function comparisonRows(policy: RoomPolicyMap, roomIds: Tier[]): ComparisonRow[] {
  const value = (pick: (p: RoomPrivileges) => string | boolean) => ({
    values: roomIds.map((tier) => {
      const privileges = policy[tier];
      return privileges ? pick(privileges) : "—";
    }),
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
  const { policy, profiles, roomIds, profileOf } = useRoomSettings();
  const { user, loading: authLoading } = useAuth();
  const rows = comparisonRows(policy, roomIds);
  const rank = (tier: Tier) => roomIds.indexOf(tier);

  const { data: allSpecialists, isLoading: specialistsLoading } = useSpecialists("all");
  const { data: membership, isLoading: membershipLoading } = useMyMembership(user?.id);
  const membershipCheckout = useServerFn(startMembershipCheckout);
  const [joining, setJoining] = useState<Tier | null>(null);

  async function joinRoom(room: Tier) {
    setJoining(room);
    try {
      const checkout = await membershipCheckout({
        data: { room, callbackUrl: `${window.location.origin}/payment/return` },
      });
      toast.success("Taking you to Paystack…", {
        description: `${money(checkout.amount)} monthly membership for the ${tierLabel(room)} room.`,
      });
      window.location.href = checkout.authorizationUrl;
    } catch (error) {
      setJoining(null);
      toast.error(error instanceof Error ? error.message : "Checkout could not be started");
    }
  }

  const specialistCounts: Partial<Record<Tier, number>> = {};
  for (const tier of roomIds) specialistCounts[tier] = 0;
  for (const specialist of allSpecialists ?? []) {
    const room = specialist.room as Tier | null;
    if (room && room in specialistCounts) {
      specialistCounts[room] = (specialistCounts[room] ?? 0) + 1;
    }
  }

  const activeMembership =
    membership && membership.status === "active" ? membership : null;

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

        {user ? <MemberDashboardStrip /> : null}


        {!authLoading && !user ? (
          <Card className="mt-6 border-primary/25 bg-panel p-5">
            <p className="flex items-center gap-2 font-display text-base font-semibold">
              <LogIn className="size-4" /> Sign in to see your room and join one
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              You can compare rooms below without an account, but joining or upgrading a room
              needs a signed-in client account.
            </p>
            <Button asChild variant="soft" className="mt-4">
              <Link to="/auth">Sign in or create an account</Link>
            </Button>
          </Card>
        ) : null}

        {user && !membershipLoading && activeMembership ? (
          <Card className="mt-6 border-border/70 bg-panel p-5">
            <p className="text-sm text-muted-foreground">You're currently in</p>
            <p className="mt-1 font-display text-lg font-semibold">
              {tierLabel(activeMembership.room)} Room
            </p>
          </Card>
        ) : null}

        {user && !membershipLoading && !activeMembership ? (
          <Card className="mt-6 border-dashed border-border/70 bg-panel/60 p-5">
            <p className="text-sm text-muted-foreground">
              You don't have an active membership yet. Pick a room below to get started.
            </p>
          </Card>
        ) : null}

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {roomIds.map((tier) => {
            const privileges = policy[tier] ?? NEW_ROOM_PRIVILEGES;
            const profile = profileOf(tier);
            const specialistCount = specialistCounts[tier] ?? 0;
            const isCurrentRoom = activeMembership?.room === tier;
            const isUpgrade =
              Boolean(activeMembership) &&
              !isCurrentRoom &&
              rank(tier) > rank(activeMembership!.room as Tier);

            return (
              <Card
                key={tier}
                data-featured={tier === "premium"}
                className="flex flex-col border-border/70 border-t-2 bg-panel p-6 data-[featured=true]:shadow-elevated"
                style={{
                  ...roomAccentStyle(privileges.accent),
                  borderTopColor: "var(--room-accent)",
                }}
              >
                <div className="flex items-center justify-between">
                  <TierBadge tier={tier} withRoom />
                  {tier === "premium" ? (
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
                  ) : isCurrentRoom ? (
                    <Badge
                      variant="outline"
                      className="rounded-full"
                      style={{
                        color: "var(--room-accent)",
                        borderColor: "color-mix(in oklab, var(--room-accent) 35%, transparent)",
                      }}
                    >
                      Your room
                    </Badge>
                  ) : null}
                </div>

                <p className="mt-5 font-display text-4xl font-semibold">
                  {money(profile.priceMonthly)}
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Client membership · free for specialists
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{profile.tagline}</p>

                <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/50 px-2 py-0.5">
                    <Users className="size-3.5" />
                    {specialistsLoading ? "…" : specialistCount} specialist
                    {specialistCount === 1 ? "" : "s"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/50 px-2 py-0.5">
                    Visit fees {money(profile.visitFeeMin)}–{money(profile.visitFeeMax)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/50 px-2 py-0.5">
                    {profile.intakeOpen ? `${profile.seatsLeft} seats open` : "Intake closed"}
                  </span>
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

                {!user ? (
                  <Button asChild variant={tier === "premium" ? "brass" : "soft"} className="mt-7 w-full">
                    <Link to="/auth">Sign in to join</Link>
                  </Button>
                ) : isCurrentRoom ? (
                  <Button variant="soft" className="mt-7 w-full" disabled>
                    Your current room
                  </Button>
                ) : (
                  <div className="mt-7 space-y-2">
                    <Button
                      variant={tier === "premium" ? "brass" : "soft"}
                      className="w-full"
                      disabled={joining !== null}
                      onClick={() => void joinRoom(tier)}
                    >
                      {joining === tier
                        ? "Opening Paystack…"
                        : `${isUpgrade ? "Upgrade" : "Join"} for ${money(profile.priceMonthly)}/mo`}
                    </Button>
                    <Button asChild variant="ghost" className="w-full">
                      <Link to="/apply">
                        {isUpgrade ? "Apply to upgrade to" : "Apply for"}{" "}
                        {profile.name.replace(" Room", "")}
                      </Link>
                    </Button>
                  </div>
                )}
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
                  {roomIds.map((tier) => (
                    <TableHead key={tier} className="text-center">
                      {profileOf(tier).name.replace(" Room", "")}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.feature}>
                    <TableCell className="font-medium">{row.feature}</TableCell>
                    {row.values.map((value, index) => (
                      <TableCell
                        key={roomIds[index] ?? index}
                        className="text-center text-muted-foreground"
                      >
                        <Cell value={value} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        {!specialistsLoading && (allSpecialists?.length ?? 0) === 0 ? (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            We're still onboarding vetted specialists into these rooms — seat counts will fill in
            as approvals land.
          </p>
        ) : null}
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
