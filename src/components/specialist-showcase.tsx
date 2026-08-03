/**
 * Client-facing showcase of vetted specialists. Clients land on `/rooms` after
 * signing in, so this is the first thing they see: a spotlight on the top-rated
 * specialist their room opens, a swipeable row of faces, and live counts.
 * Specialists never see this — they only meet a client once that client opens a
 * thread.
 */
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MessageCircle, ShieldCheck, Sparkles, Star, Timer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SpecialistTile } from "@/components/specialist-tile";
import { TierBadge } from "@/components/tier-badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSpecialists, useStoredMedia, type ProfileRow } from "@/lib/queries";
import {
  accessibleTiers,
  ALL_TIERS,
  initials,
  money,
  type Specialist,
  type Tier,
} from "@/lib/types";

function toSpecialist(profile: ProfileRow, serviceNames: string[]): Specialist {
  return {
    id: profile.id,
    name: profile.display_name || "Ashnight specialist",
    city: profile.city,
    room: profile.room ?? "basic",
    headline: profile.headline,
    bio: profile.bio,
    rating: profile.rating,
    jobsCompleted: profile.jobs_completed,
    hourlyRate: profile.hourly_rate,
    yearsExperience: profile.years_experience,
    services: serviceNames,
    languages: profile.languages,
    verified: profile.verified,
    online: profile.available,
    responseMinutes: profile.response_minutes,
    avatarPath: profile.avatar_url,
  };
}

/** Specialist -> service names, so cards can badge without an N+1 fetch. */
function useShowcaseServiceMap() {
  return useQuery({
    queryKey: ["specialist-service-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialist_services")
        .select("specialist_id, services(name)");
      if (error) throw new Error(error.message);
      const map = new Map<string, string[]>();
      for (const row of (data ?? []) as unknown as {
        specialist_id: string;
        services: { name: string } | null;
      }[]) {
        const name = row.services?.name;
        if (!name) continue;
        map.set(row.specialist_id, [...(map.get(row.specialist_id) ?? []), name]);
      }
      return map;
    },
  });
}

/** Big lead card for the highest-rated specialist the member can reach. */
function SpotlightCard({ specialist }: { specialist: Specialist }) {
  const { data: media } = useStoredMedia(
    specialist.avatarPath ? [{ bucket: "avatars" as const, value: specialist.avatarPath }] : [],
  );
  const avatarUrl = specialist.avatarPath ? media?.[specialist.avatarPath] : undefined;

  return (
    <Card className="overflow-hidden border-border/70 bg-panel p-0 shadow-elevated">
      <div className="grid sm:grid-cols-[minmax(0,13rem)_1fr]">
        <Link
          to="/specialists/$specialistId"
          params={{ specialistId: specialist.id }}
          className="group relative block aspect-[4/3] overflow-hidden bg-surface-strong sm:aspect-auto sm:h-full"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={`${specialist.name}, vetted ash specialist in ${specialist.city}`}
              className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex size-full items-center justify-center font-display text-3xl font-semibold text-muted-foreground">
              {initials(specialist.name)}
            </div>
          )}
          <Badge className="absolute left-3 top-3 gap-1 rounded-full bg-background/85 text-foreground backdrop-blur">
            <Star className="size-3 fill-brass text-brass" /> Top rated
          </Badge>
        </Link>

        <div className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-lg font-semibold">{specialist.name}</p>
            {specialist.verified ? <ShieldCheck className="size-4 text-accent" /> : null}
            <TierBadge tier={specialist.room} />
            {specialist.online ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs text-success">
                <span className="size-1.5 rounded-full bg-success" /> Online
              </span>
            ) : null}
          </div>

          <p className="line-clamp-2 text-sm text-muted-foreground">
            {specialist.headline || specialist.bio}
          </p>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Star className="size-3.5 fill-brass text-brass" />
              {specialist.rating.toFixed(2)} · {specialist.jobsCompleted} jobs
            </span>
            <span className="inline-flex items-center gap-1">
              <Timer className="size-3.5" /> replies in ~{specialist.responseMinutes} min
            </span>
            <span>{specialist.city}</span>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
            <p className="font-display text-xl font-semibold">
              {money(specialist.hourlyRate)}
              <span className="text-xs font-normal text-muted-foreground">/hr</span>
            </p>
            <Button asChild size="sm" variant="brass" className="ml-auto">
              <Link to="/specialists/$specialistId" params={{ specialistId: specialist.id }}>
                <MessageCircle className="size-4" /> View & message
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function SpecialistShowcase({ limit = 9 }: { limit?: number }) {
  const { profile, isSpecialist, isAdmin } = useAuth();
  const { data: profiles, isLoading } = useSpecialists("all");
  const { data: serviceMap } = useShowcaseServiceMap();

  // Your room decides which rooms you can see, cumulatively.
  const allowedRooms = useMemo(
    () => (isAdmin ? ALL_TIERS : accessibleTiers(profile?.room)),
    [isAdmin, profile?.room],
  );

  const reachable = useMemo(() => {
    const rows = (profiles ?? []).filter((row) =>
      allowedRooms.includes((row.room ?? "basic") as Tier),
    );
    return rows
      .map((row) => toSpecialist(row, serviceMap?.get(row.id) ?? []))
      .sort((a, b) => Number(b.online) - Number(a.online) || b.rating - a.rating);
  }, [profiles, serviceMap, allowedRooms]);

  const spotlight = reachable[0];
  const rest = reachable.slice(1, limit + 1);
  const onlineNow = reachable.filter((s) => s.online).length;

  // Specialists don't browse the roster at all.
  if (isSpecialist && !isAdmin) return null;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold sm:text-2xl">
            <Sparkles className="size-4 text-primary" /> Specialists ready for you
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLoading
              ? "Loading the roster your membership opens…"
              : `${reachable.length} vetted specialist${reachable.length === 1 ? "" : "s"} in your rooms · ${onlineNow} online now`}
          </p>
        </div>
        <Button asChild variant="soft" size="sm">
          <Link to="/specialists">
            Browse all <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-5 space-y-4">
          <Skeleton className="h-52 rounded-xl" />
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="aspect-square rounded-lg" />
            ))}
          </div>
        </div>
      ) : spotlight ? (
        <div className="mt-5 space-y-6">
          {showSpotlight ? <SpotlightCard specialist={spotlight} /> : null}
          {showRows ? <SpecialistRows roster={reachable} /> : null}
        </div>

      ) : (
        <Card className="mt-5 border-dashed border-border/70 bg-panel/60 p-5 text-sm text-muted-foreground">
          No specialists are open to your room yet. Join or upgrade a room below to widen who you
          can see.
        </Card>
      )}
    </section>
  );
}
