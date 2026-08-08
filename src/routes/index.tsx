import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  CreditCard,
  MessageSquare,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Star,
  Loader2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { IconContainer } from "@/components/ui/icon-container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SpecialistCard } from "@/components/specialist-card";
import { TierBadge } from "@/components/tier-badge";
import { supabase } from "@/integrations/supabase/client";
import { useSpecialists, type ProfileRow } from "@/lib/queries";
import { useRoomSettings } from "@/lib/room-settings";
import { initials, money, type Specialist } from "@/lib/types";
import { AuthPage } from "@/routes/auth";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in or Join Ashnight | Vetted Ash Services" },
      {
        name: "description",
        content:
          "Sign in or create an Ashnight account to access vetted ash specialists, secure in-chat booking, and room membership.",
      },
      { property: "og:title", content: "Sign in or Join Ashnight | Vetted Ash Services" },
      {
        property: "og:description",
        content:
          "Sign in or create an Ashnight account to access vetted ash specialists, secure in-chat booking, and room membership.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthHome,
});

function AuthHome() {
  const { session, loading, isAdmin, isSpecialist } = useAuth();
  // "/" is the sign-in page, full stop. Anyone already signed in is moved on:
  // admins into the control room, specialists into their conversations,
  // clients into their rooms.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (session) {
    return <Navigate to={isAdmin ? "/ashnight-control" : isSpecialist ? "/messages" : "/rooms"} replace />;
  }

  return <AuthPage />;
}

/** Maps a live profile row (plus its service names) onto the presentational Specialist shape. */
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

interface TestimonialRow {
  id: string;
  stars: number;
  note: string;
  created_at: string;
  rated: { display_name: string; room: string | null } | null;
}

function useLandingTestimonials() {
  return useQuery({
    queryKey: ["landing-testimonials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ratings")
        .select("id, stars, note, created_at, rated:profiles!ratings_rated_id_fkey(display_name, room)")
        .neq("note", "")
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as TestimonialRow[];
    },
  });
}

function useServiceNamesFor(specialistIds: string[]) {
  return useQuery({
    queryKey: ["landing-service-names", specialistIds],
    enabled: specialistIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialist_services")
        .select("specialist_id, services(name)")
        .in("specialist_id", specialistIds);
      if (error) throw new Error(error.message);
      const map = new Map<string, string[]>();
      for (const row of (data ?? []) as unknown as { specialist_id: string; services: { name: string } | null }[]) {
        const name = row.services?.name;
        if (!name) continue;
        map.set(row.specialist_id, [...(map.get(row.specialist_id) ?? []), name]);
      }
      return map;
    },
  });
}

export function Home() {
  const { data: specialists, isLoading: specialistsLoading } = useSpecialists("all");
  const { roomIds, profileOf } = useRoomSettings();

  const featured = useMemo(
    () => [...(specialists ?? [])].sort((a, b) => b.rating - a.rating).slice(0, 3),
    [specialists],
  );
  const featuredIds = useMemo(() => featured.map((s) => s.id), [featured]);
  const { data: serviceMap } = useServiceNamesFor(featuredIds);
  const { data: testimonials, isLoading: testimonialsLoading } = useLandingTestimonials();

  const stats = useMemo(() => {
    if (!specialists || specialists.length === 0) return null;
    const count = specialists.length;
    const rated = specialists.filter((s) => s.jobs_completed > 0);
    const avgRating = rated.length
      ? rated.reduce((sum, s) => sum + s.rating, 0) / rated.length
      : null;
    const avgResponse = Math.round(
      specialists.reduce((sum, s) => sum + s.response_minutes, 0) / count,
    );
    return { count, avgRating, avgResponse };
  }, [specialists]);

  const roomCounts = useMemo(() => {
    const counts: Record<string, number> = { basic: 0, premium: 0, ultimate: 0 };
    for (const specialist of specialists ?? []) {
      if (specialist.room) counts[specialist.room] = (counts[specialist.room] ?? 0) + 1;
    }
    return counts;
  }, [specialists]);

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <section className="relative overflow-hidden bg-hero">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:py-28">
          <Badge
            variant="outline"
            className="gap-2 rounded-full border-primary/30 bg-primary/10 px-3 py-1 text-primary"
          >
            <Sparkles className="size-3.5" /> Every member manually vetted
          </Badge>

          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.05] sm:text-6xl">
            Ash specialists you'd actually{" "}
            <span className="text-brass">trust with your keys.</span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Ashnight is a members-only platform for residential and commercial ash. We
            interview, ID-check and reference-check every specialist by hand, then place them in
            a room that matches their standard of work.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg" variant="brass">
              <Link to="/apply" search={{ role: "client" }}>
                Apply for membership <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="soft">
              <Link to="/specialists">Browse specialists</Link>
            </Button>
          </div>

          <dl className="mt-14 grid max-w-2xl grid-cols-2 gap-6 sm:grid-cols-4">
            {specialistsLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index}>
                  <Skeleton className="h-7 w-14" />
                  <Skeleton className="mt-2 h-3 w-20" />
                </div>
              ))
            ) : (
              [
                {
                  value: stats ? String(stats.count) : "New",
                  label: "Vetted specialists",
                },
                {
                  value: stats?.avgRating ? stats.avgRating.toFixed(2) : "—",
                  label: "Average rating",
                },
                {
                  value: stats ? `${stats.avgResponse} min` : "—",
                  label: "Median chat reply",
                },
                { value: "100%", label: "On-platform payments" },
              ].map((stat) => (
                <div key={stat.label}>
                  <dt className="font-display text-2xl font-semibold text-foreground">
                    {stat.value}
                  </dt>
                  <dd className="mt-1 text-xs text-muted-foreground">{stat.label}</dd>
                </div>
              ))
            )}
          </dl>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 py-20">
        <h2 className="eyebrow">How Ashnight works</h2>
        <p className="mt-3 max-w-2xl font-display text-2xl font-semibold sm:text-3xl">
          Vetting first, chat second, booking and payment in the same thread.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: ShieldCheck,
              title: "Manual vetting",
              body: "Application, ID verification, background check and reference calls — reviewed by a real person before onboarding.",
            },
            {
              icon: BadgeCheck,
              title: "Room placement",
              body: "Specialists are placed into Basic, Premium or Ultimate by experience and quality — free of charge. Clients enter by paid subscription.",
            },
            {
              icon: MessageSquare,
              title: "Scope it in chat",
              body: "Talk through the property, share photos, and hop on a voice or video walkthrough before anyone commits.",
            },
            {
              icon: CreditCard,
              title: "Request & pay in-thread",
              body: "One button turns the conversation into a booking with an itemised quote, held securely until the job is done.",
            },
          ].map((step) => (
            <Card
              key={step.title}
              className="border-border/70 bg-panel p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-elevated"
            >
              <IconContainer icon={step.icon} tone="default" />
              <h3 className="mt-4 font-display text-base font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 pb-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="eyebrow">Membership rooms</h2>
            <p className="mt-3 font-display text-2xl font-semibold sm:text-3xl">
              Three rooms. Same vetting bar, different level of access.
            </p>
          </div>
          <Button asChild variant="ghost">
            <Link to="/rooms">
              Compare all perks <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {roomIds.map((tier) => {
            const room = profileOf(tier);
            return (
              <Card
                key={tier}
                className="flex flex-col border-border/70 bg-panel p-6 data-[featured=true]:border-primary/40"
                data-featured={tier === "premium"}
              >
                <TierBadge tier={tier} withRoom className="self-start" />
                <p className="mt-5 font-display text-3xl font-semibold">
                  {money(room.priceMonthly)}
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{room.tagline}</p>
                <p className="mt-4 text-xs text-muted-foreground">
                  Visit fees {money(room.visitFeeMin)}–{money(room.visitFeeMax)} ·{" "}
                  {roomCounts[tier] ?? 0} specialists
                </p>
                <Button asChild variant={tier === "premium" ? "brass" : "soft"} className="mt-6">
                  <Link to="/rooms">See {room.name}</Link>
                </Button>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 pb-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="eyebrow">Top rated this month</h2>
            <p className="mt-3 font-display text-2xl font-semibold sm:text-3xl">
              Featured specialists
            </p>
          </div>
          <Button asChild variant="ghost">
            <Link to="/specialists">
              View all <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
        {specialistsLoading ? (
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-64 rounded-xl" />
            ))}
          </div>
        ) : featured.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-border p-10 text-center">
            <p className="font-display text-lg font-semibold">No specialists yet</p>
            <p className="mt-2 text-sm text-muted-foreground">
              We're onboarding our first vetted specialists. Check back soon, or apply yourself.
            </p>
          </div>
        ) : (
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {featured.map((specialist) => (
              <SpecialistCard
                key={specialist.id}
                specialist={toSpecialist(specialist, serviceMap?.get(specialist.id) ?? [])}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 pb-20">
        <h2 className="eyebrow">What members are saying</h2>
        <p className="mt-3 font-display text-2xl font-semibold sm:text-3xl">
          Real ratings, left after a real booking.
        </p>
        {testimonialsLoading ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-36 rounded-xl" />
            ))}
          </div>
        ) : !testimonials || testimonials.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
            <p className="font-display text-lg font-semibold">No reviews yet</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Testimonials will appear here once members start rating completed bookings.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {testimonials.map((review) => (
              <Card key={review.id} className="border-border/70 bg-panel p-5">
                <div className="flex items-center gap-1 text-primary">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star
                      key={index}
                      className="size-3.5"
                      fill={index < review.stars ? "currentColor" : "none"}
                    />
                  ))}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  "{review.note}"
                </p>
                <p className="mt-3 text-xs font-medium text-foreground">
                  {review.rated?.display_name ?? "Ashnight specialist"}
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 pb-4">
        <Card className="overflow-hidden border-primary/25 bg-hero p-8 sm:p-12 shadow-glow">
          <div className="flex flex-wrap items-center justify-between gap-8">
            <div className="max-w-lg">
              <IconContainer icon={PhoneCall} tone="default" size="lg" />
              <h2 className="mt-4 font-display text-2xl font-semibold sm:text-3xl">
                Walk them through the space before you book.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Premium and Ultimate members get voice and video calls inside the chat, so a
                specialist can see the job and quote it accurately the first time.
              </p>
            </div>
            <Button asChild size="lg" variant="brass">
              <Link to="/messages">Open messages</Link>
            </Button>
          </div>
        </Card>
      </section>

      <SiteFooter />
    </div>
  );
}
