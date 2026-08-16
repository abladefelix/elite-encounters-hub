/**
 * Signed-in home dashboard.
 *
 * The Home tab is no longer a redirect into chat. It is a quick-read surface
 * that shows each member what matters right now: unread conversations, money
 * movement, the next visit, and the fastest path to the actions they use most.
 */
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Banknote,
  CheckCircle,
  ChevronRight,
  MessageCircle,
  MessageSquare,
  Sparkles,
  User,
  Wallet,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MemberDashboardStrip } from "@/components/member-dashboard-strip";
import { SpecialistShowcase } from "@/components/specialist-showcase";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/hooks/use-auth";
import {
  useBookings,
  useProfilesByIds,
  useSpecialists,
  useStoredMedia,
  useThreads,
  type ProfileRow,
  type ThreadRow,
} from "@/lib/queries";
import { useRoomSettings } from "@/lib/room-settings";
import { initials, tierLabel } from "@/lib/types";

function useRecentThreads(userId: string | undefined) {
  const threadsQuery = useThreads(userId);
  const threads = threadsQuery.data ?? [];
  const otherIds = useMemo(
    () =>
      threads
        .map((thread) => (thread.client_id === userId ? thread.specialist_id : thread.client_id))
        .filter(Boolean),
    [threads, userId],
  );
  const profilesQuery = useProfilesByIds(otherIds);
  const profiles = profilesQuery.data ?? [];
  const profileById = useMemo(() => {
    const map = new Map<string, ProfileRow>();
    for (const profile of profiles) map.set(profile.id, profile);
    return map;
  }, [profiles]);

  return { threads, profileById, isLoading: threadsQuery.isLoading || profilesQuery.isLoading };
}

function ThreadPreview({
  thread,
  other,
  isClient,
}: {
  thread: ThreadRow;
  other: ProfileRow | undefined;
  isClient: boolean;
}) {
  const avatarPath = other?.avatar_url;
  const { data: media } = useStoredMedia(
    avatarPath ? [{ bucket: "avatars" as const, value: avatarPath }] : [],
  );
  const avatarUrl = avatarPath ? media?.[avatarPath] : undefined;
  const name = other?.display_name ?? (isClient ? "Ashnight specialist" : "Member");
  const lastRead = isClient ? thread.client_last_read_at : thread.specialist_last_read_at;
  const unread = new Date(thread.last_message_at) > new Date(lastRead);

  return (
    <Link
      to="/messages"
      search={{ thread: thread.id }}
      className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-3 transition-colors hover:border-primary/30 hover:bg-background/70"
    >
      <Avatar className="size-11 border border-border">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
        <AvatarFallback className="bg-surface-strong text-xs">{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{name}</p>
          {unread ? (
            <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {thread.last_message || "No messages yet"}
        </p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function RecentThreads({ userId, isClient }: { userId: string; isClient: boolean }) {
  const { threads, profileById, isLoading } = useRecentThreads(userId);
  const recent = threads.slice(0, 4);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!recent.length) {
    return (
      <Card className="border-dashed border-border/70 bg-panel/60 p-5 text-center">
        <MessageSquare className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">No conversations yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {isClient
            ? "Browse specialists and start your first chat."
            : "Clients will message you once your profile is live."}
        </p>
        <Button asChild size="sm" variant="soft" className="mt-4">
          <Link to={isClient ? "/specialists" : "/messages"}>
            {isClient ? "Find a specialist" : "Open messages"}
          </Link>
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {recent.map((thread) => {
        const otherId = isClient ? thread.specialist_id : thread.client_id;
        const other = profileById.get(otherId);
        return <ThreadPreview key={thread.id} thread={thread} other={other} isClient={isClient} />;
      })}
      {threads.length > 4 ? (
        <Button asChild variant="ghost" size="sm" className="w-full">
          <Link to="/messages">See all conversations</Link>
        </Button>
      ) : null}
    </div>
  );
}

function QuickActions({ isClient }: { isClient: boolean }) {
  const actions = isClient
    ? [
        { to: "/messages" as const, icon: MessageCircle, label: "Messages" },
        { to: "/specialists" as const, icon: Sparkles, label: "Specialists" },
        { to: "/wallet" as const, icon: Wallet, label: "Money" },
        { to: "/support" as const, icon: User, label: "Support", search: { tab: "complaints" } },
      ]
    : [
        { to: "/messages" as const, icon: MessageCircle, label: "Messages" },
        { to: "/wallet" as const, icon: Banknote, label: "Earnings" },
        { to: "/profile" as const, icon: User, label: "Profile" },
        { to: "/support" as const, icon: MessageSquare, label: "Support", search: { tab: "complaints" } },
      ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {actions.map((action) => (
        <Link
          key={action.to}
          to={action.to}
          {...(action.search ? { search: action.search } : {})}
          className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-background/40 p-3 text-center transition-colors hover:border-primary/30 hover:bg-background/70"
        >
          <action.icon className="size-5 text-primary" />
          <span className="text-[0.65rem] font-medium leading-tight">{action.label}</span>
        </Link>
      ))}
    </div>
  );
}

function SpecialistPendingAcks({ userId }: { userId: string }) {
  const { data: bookings, isLoading } = useBookings();
  const pending = useMemo(
    () =>
      (bookings ?? []).filter(
        (booking) =>
          booking.specialist_id === userId &&
          booking.status === "requested" &&
          booking.ack_requested_at &&
          !booking.acknowledged_at,
      ),
    [bookings, userId],
  );

  if (isLoading) {
    return <Skeleton className="h-32 rounded-xl" />;
  }

  if (!pending.length) return null;

  return (
    <Card className="border-primary/25 bg-primary/5 p-4">
      <div className="flex items-center gap-2">
        <CheckCircle className="size-4 text-primary" />
        <p className="font-display text-sm font-semibold">
          {pending.length} booking request{pending.length === 1 ? "" : "s"} to acknowledge
        </p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Review the service details in chat and acknowledge before the client can pay.
      </p>
      <Button asChild size="sm" variant="brass" className="mt-3">
        <Link to="/messages">Go to messages</Link>
      </Button>
    </Card>
  );
}

function RoomStatusCard({ isClient }: { isClient: boolean }) {
  const { profile } = useAuth();
  const { profileOf } = useRoomSettings();
  const room = profile?.room;
  const roomInfo = room ? profileOf(room) : null;

  if (!room || !roomInfo) return null;

  return (
    <Card className="border-border/70 bg-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Your room</p>
          <p className="font-display text-base font-semibold">{tierLabel(room)} Room</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{roomInfo.tagline}</p>
        </div>
        <Button asChild size="sm" variant="soft">
          <Link to={isClient ? "/rooms" : "/profile"}>
            {isClient ? "Manage" : "Profile"}
          </Link>
        </Button>
      </div>
    </Card>
  );
}

export function MemberHome() {
  const { user, profile, isSpecialist } = useAuth();
  const isClient = !isSpecialist;
  const { data: specialists, isLoading: specialistsLoading } = useSpecialists("all");

  // Not vetted yet: show the waiting room instead of an empty dashboard.
  if (profile && (profile.account_status === "pending" || profile.vetting !== "approved")) {
    return <PendingApprovalHome />;
  }

  const firstName = (profile?.display_name ?? "there").split(" ")[0];
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-5 sm:pt-6">
        {/* Welcome + live stats */}
        <MemberDashboardStrip />

        {/* Quick action grid */}
        <section className="mt-6">
          <QuickActions isClient={isClient} />
        </section>

        {/* Specialist-only: pending acknowledgements */}
        {isSpecialist && user ? (
          <div className="mt-6">
            <SpecialistPendingAcks userId={user.id} />
          </div>
        ) : null}

        {/* Client-only: spotlight + swipeable rows */}
        {isClient ? (
          <section className="mt-8">
            <SpecialistShowcase />
          </section>
        ) : null}

        {/* Fallback for empty specialist roster on client home */}
        {isClient && !specialistsLoading && !(specialists ?? []).length ? (
          <Card className="mt-6 border-dashed border-border/70 bg-panel/60 p-5 text-center text-sm text-muted-foreground">
            No specialists are live yet. Check back once vetting completes.
          </Card>
        ) : null}

        {/* Recent conversations */}
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Recent chats</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/messages">All chats</Link>
            </Button>
          </div>
          {user ? <RecentThreads userId={user.id} isClient={isClient} /> : null}
        </section>

        {/* Room / membership status */}
        <section className="mt-8">
          <RoomStatusCard isClient={isClient} />
        </section>
      </main>
    </div>
  );
}
