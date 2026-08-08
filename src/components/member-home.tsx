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
  CalendarClock,
  CheckCircle,
  ChevronRight,
  MessageCircle,
  MessageSquare,
  Sparkles,
  User,
  Wallet,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MemberDashboardStrip } from "@/components/member-dashboard-strip";
import { SpecialistShowcase } from "@/components/specialist-showcase";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/hooks/use-auth";
import {
  useBookings,
  useEscrowEntries,
  useProfilesByIds,
  useSpecialists,
  useStoredMedia,
  useThreads,
  type ProfileRow,
  type ThreadRow,
} from "@/lib/queries";
import { useRoomSettings } from "@/lib/room-settings";
import { initials, money, tierLabel } from "@/lib/types";
import { formatStamp } from "@/lib/utils";

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
  const unread =
    thread.client_id === (isClient ? thread.client_id : thread.specialist_id)
      ? new Date(thread.last_message_at) > new Date(thread.client_last_read_at)
      : new Date(thread.last_message_at) > new Date(thread.specialist_last_read_at);

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
          <p className="truncate font-medium text-sm">{name}</p>
          {unread ? (
            <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {thread.last_message_preview || "No messages yet"}
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
          <Link to={isClient ? "/specialists" : "/messages