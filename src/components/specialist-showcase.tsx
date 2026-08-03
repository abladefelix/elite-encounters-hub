/**
 * Client-facing showcase of a handful of vetted specialists. Clients land on
 * `/rooms` after signing in, so this gives them faces and rates straight away
 * instead of a pricing table only. Specialists never see this — they only meet
 * a client once that client opens a thread.
 */
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SpecialistCard } from "@/components/specialist-card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSpecialists, type ProfileRow } from "@/lib/queries";
import { accessibleTiers, ALL_TIERS, type Specialist, type Tier } from "@/lib/types";

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

export function SpecialistShowcase({ limit = 3 }: { limit?: number }) {
  const { profile, isSpecialist, isAdmin } = useAuth();
  const { data: profiles, isLoading } = useSpecialists("all");
  const { data: serviceMap } = useShowcaseServiceMap();

  // Your room decides which rooms you can see, cumulatively.
  const allowedRooms = useMemo(
    () => (isAdmin ? ALL_TIERS : accessibleTiers(profile?.room)),
    [isAdmin, profile?.room],
  );

  const featured = useMemo(() => {
    const rows = (profiles ?? []).filter((row) =>
      allowedRooms.includes((row.room ?? "basic") as Tier),
    );
    return rows.slice(0, limit).map((row) => toSpecialist(row, serviceMap?.get(row.id) ?? []));
  }, [profiles, serviceMap, allowedRooms, limit]);

  // Specialists don't browse the roster at all.
  if (isSpecialist && !isAdmin) return null;

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
            <Sparkles className="size-4 text-primary" /> Specialists ready for you
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Top-rated vetted specialists in the rooms your membership opens.
          </p>
        </div>
        <Button asChild variant="soft" size="sm">
          <Link to="/specialists">
            Browse all <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: limit }).map((_, index) => (
            <Skeleton key={index} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : featured.length ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((specialist) => (
            <SpecialistCard key={specialist.id} specialist={specialist} />
          ))}
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
