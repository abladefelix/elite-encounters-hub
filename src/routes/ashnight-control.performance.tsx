/**
 * Specialist performance: what clients actually rated after paid visits, and
 * the room each specialist's record supports. Room moves stay a manual admin
 * decision — this page only shows the evidence and applies the change.
 */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, Star, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataPager, usePaged } from "@/components/ui/data-pager";
import { TierBadge } from "@/components/tier-badge";
import { useAdminAccess } from "@/lib/admin-permissions";
import { useAllProfiles, useRatings, useUpdateProfile, type ProfileFullRow } from "@/lib/queries";
import { useRoomSettings } from "@/lib/room-settings";
import { REVIEW_THRESHOLD, summarizeFeedback, tierAdvice } from "@/lib/ratings";
import type { Tier } from "@/lib/types";
import { formatStamp } from "@/lib/utils";

export const Route = createFileRoute("/ashnight-control/performance")({
  head: () => ({
    meta: [
      { title: "Specialist Performance | Ashnight Admin" },
      {
        name: "description",
        content:
          "Review client ratings from completed Ashnight visits and move specialists between rooms based on real performance.",
      },
      { property: "og:title", content: "Specialist Performance | Ashnight Admin" },
      {
        property: "og:description",
        content: "Ratings, trends and room advice drawn from paid, completed visits.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPerformance,
});

function isSpecialistRow(row: ProfileFullRow) {
  if (row.roles?.length) return row.roles.includes("specialist");
  return Boolean(row.room) || row.hourly_rate > 0;
}

type Sort = "advice" | "rating" | "volume" | "recent";

function AdminPerformance() {
  const access = useAdminAccess();
  const profilesQuery = useAllProfiles();
  const ratingsQuery = useRatings();
  const updateProfile = useUpdateProfile();
  const { roomIds } = useRoomSettings();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("advice");

  const ratings = ratingsQuery.data ?? [];

  const rows = useMemo(() => {
    const specialists = (profilesQuery.data ?? []).filter(isSpecialistRow);
    const term = query.trim().toLowerCase();
    const built = specialists.map((profile) => {
      const summary = summarizeFeedback(profile.id, ratings);
      const advice = tierAdvice({
        summary,
        jobsCompleted: profile.jobs_completed,
        currentRoom: (profile.room as Tier | null) ?? null,
        tiers: roomIds,
      });
      return { profile, summary, advice };
    });

    const filtered = term
      ? built.filter((row) =>
          `${row.profile.display_name} ${row.profile.username ?? ""} ${row.profile.city}`
            .toLowerCase()
            .includes(term),
        )
      : built;

    const rank = { promote: 0, review: 1, hold: 2, thin: 3 } as const;
    return [...filtered].sort((a, b) => {
      if (sort === "rating") return b.summary.average - a.summary.average;
      if (sort === "volume") return b.summary.count - a.summary.count;
      if (sort === "recent")
        return (b.summary.lastRatedAt ?? "") < (a.summary.lastRatedAt ?? "") ? -1 : 1;
      return rank[a.advice.tone] - rank[b.advice.tone];
    });
  }, [profilesQuery.data, query, ratings, roomIds, sort]);

  const paged = usePaged(rows, 10);

  const actionable = rows.filter((row) => row.advice.tone === "promote" || row.advice.tone === "review");
  const reviewed = rows.filter((row) => row.summary.count >= REVIEW_THRESHOLD).length;

  function moveRoom(profile: ProfileFullRow, room: Tier) {
    if (access.readOnly) {
      toast.error("Your admin account is read-only.");
      return;
    }
    updateProfile.mutate(
      { id: profile.id, patch: { room } },
      {
        onSuccess: () => toast.success(`${profile.display_name} moved to ${room}`),
        onError: (error) => toast.error("Room change failed", { description: error.message }),
      },
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-semibold">Specialist performance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every rating here comes from a client who paid for and received a visit. Rooms stay under
          admin control — the advice column is a suggestion, not an automatic move.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Specialists tracked" value={String(rows.length)} />
        <Stat label="With enough ratings" value={String(reviewed)} />
        <Stat label="Needing a decision" value={String(actionable.length)} />
      </div>

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[220px] flex-1">
          <Label htmlFor="perf-search">Search specialists</Label>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="perf-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, username or city"
              className="pl-9"
            />
          </div>
        </div>
        <div className="w-48">
          <Label htmlFor="perf-sort">Sort by</Label>
          <Select value={sort} onValueChange={(value) => setSort(value as Sort)}>
            <SelectTrigger id="perf-sort" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="advice">Needs a decision</SelectItem>
              <SelectItem value="rating">Highest rated</SelectItem>
              <SelectItem value="volume">Most ratings</SelectItem>
              <SelectItem value="recent">Most recently rated</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {ratingsQuery.isLoading || profilesQuery.isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading performance records…</Card>
      ) : rows.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          No specialist records yet. Ratings appear once clients confirm and review completed visits.
        </Card>
      ) : (
        <div className="space-y-3">
          {paged.rows.map(({ profile, summary, advice }) => (
            <Card key={profile.id} className="space-y-4 p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{profile.display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {profile.city || "No city"} · {profile.jobs_completed} completed job
                    {profile.jobs_completed === 1 ? "" : "s"}
                    {summary.lastRatedAt ? ` · last rated ${formatStamp(summary.lastRatedAt)}` : ""}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {profile.room ? <TierBadge tier={profile.room as Tier} /> : (
                    <Badge variant="outline">No room</Badge>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <Metric
                  label="Average"
                  value={summary.count ? summary.average.toFixed(2) : "—"}
                  icon={<Star className="size-3.5" />}
                />
                <Metric
                  label="Recent 6"
                  value={summary.count ? summary.recentAverage.toFixed(2) : "—"}
                  icon={
                    summary.recentAverage >= summary.average ? (
                      <TrendingUp className="size-3.5" />
                    ) : (
                      <TrendingDown className="size-3.5" />
                    )
                  }
                />
                <Metric label="Ratings" value={String(summary.count)} />
                <Metric label="Low (1-2★)" value={String(summary.lowStars)} />
              </div>

              {summary.tagCounts.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {summary.tagCounts.slice(0, 6).map((tag) => (
                    <Badge key={tag.tag} variant="secondary" className="text-[11px]">
                      {tag.tag} · {tag.count}
                    </Badge>
                  ))}
                </div>
              ) : null}

              <div className="rounded-xl border border-border/70 bg-surface p-3">
                <p className="flex items-center gap-2 text-xs font-medium text-primary">
                  <Trophy className="size-3.5" /> Room advice
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{advice.reason}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {advice.tier && advice.tier !== profile.room ? (
                    <Button
                      variant="brass"
                      size="sm"
                      disabled={access.readOnly || updateProfile.isPending}
                      onClick={() => moveRoom(profile, advice.tier!)}
                    >
                      Move to {advice.tier}
                    </Button>
                  ) : null}
                  <Select
                    value={(profile.room as string | null) ?? ""}
                    onValueChange={(value) => moveRoom(profile, value as Tier)}
                  >
                    <SelectTrigger className="w-44" aria-label={`Set room for ${profile.display_name}`}>
                      <SelectValue placeholder="Set room manually" />
                    </SelectTrigger>
                    <SelectContent>
                      {roomIds.map((room) => (
                        <SelectItem key={room} value={room}>
                          {room}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {summary.notes.length ? (
                <ul className="space-y-2">
                  {summary.notes.slice(0, 3).map((note) => (
                    <li key={`${note.at}-${note.note}`} className="rounded-lg bg-background/50 p-3 text-sm">
                      <span className="font-medium text-primary">{note.stars}★</span>{" "}
                      <span className="text-muted-foreground">{note.note}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {formatStamp(note.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ))}
          <DataPager paged={paged} label="specialists" />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
    </Card>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-3">
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon} {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold">{value}</p>
    </div>
  );
}
