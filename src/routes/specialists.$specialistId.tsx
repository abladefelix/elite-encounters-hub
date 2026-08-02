import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Clock,
  Globe,
  MapPin,
  MessageSquare,
  Star,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { TierBadge } from "@/components/tier-badge";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { openThread, useRatings, useServices, useSpecialistServices } from "@/lib/queries";
import { useRoomSettings } from "@/lib/room-settings";
import { initials, money } from "@/lib/types";

export const Route = createFileRoute("/specialists/$specialistId")({
  loader: async ({ params }) => {
    const { data, error } = await supabase
      .from("specialist_directory")
      .select("*")
      .eq("id", params.specialistId)
      .eq("vetting", "approved")
      .eq("suspended", false)
      .maybeSingle();
    if (error || !data) throw notFound();
    return { specialist: data };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Specialist not found — Ashnight" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const { specialist } = loaderData;
    const description = `${specialist.display_name} — ${specialist.headline}. ${specialist.rating.toFixed(2)}★ across ${specialist.jobs_completed} completed cleans on Ashnight.`;
    return {
      meta: [
        { title: `${specialist.display_name} — Ash Specialist on Ashnight` },
        { name: "description", content: description },
        { property: "og:title", content: `${specialist.display_name} — Ash Specialist` },
        { property: "og:description", content: description },
      ],
    };
  },
  errorComponent: () => <ProfileFallback title="This profile didn't load" />,
  notFoundComponent: () => <ProfileFallback title="Specialist not found" />,
  component: SpecialistProfile,
});

function ProfileFallback({ title }: { title: string }) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-2xl px-5 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The specialist may have been moved to another room or paused their account.
        </p>
        <Button asChild variant="brass" className="mt-6">
          <Link to="/specialists">Back to specialists</Link>
        </Button>
      </div>
      <SiteFooter />
    </div>
  );
}

function SpecialistProfile() {
  const { specialist } = Route.useLoaderData();
  const { profileOf } = useRoomSettings();
  const room = specialist.room ? profileOf(specialist.room) : null;
  const { user } = useAuth();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);

  const { data: serviceLinks } = useSpecialistServices(specialist.id);
  const { data: allServices } = useServices(true);
  const { data: reviews } = useRatings(specialist.id);

  const serviceNames = (serviceLinks ?? [])
    .map((link) => allServices?.find((service) => service.id === link.service_id)?.name)
    .filter((name): name is string => Boolean(name));

  async function handleStartChat() {
    if (!user) {
      void navigate({ to: "/auth", search: { next: `/specialists/${specialist.id}` } });
      return;
    }
    if (user.id === specialist.id) {
      toast.error("You can't message your own profile.");
      return;
    }
    setStarting(true);
    try {
      await openThread(user.id, specialist.id, specialist.room);
      void navigate({ to: "/messages" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't open that chat.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <div className="mx-auto w-full max-w-5xl px-5 py-10">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link to="/specialists">
            <ArrowLeft className="size-4" /> All specialists
          </Link>
        </Button>

        <Card className="mt-4 border-border/70 bg-panel p-6 sm:p-8">
          <div className="flex flex-wrap items-start gap-5">
            <Avatar className="size-20 border border-border">
              <AvatarFallback className="bg-surface-strong font-display text-xl font-semibold">
                {initials(specialist.display_name || "Ashnight")}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-2xl font-semibold sm:text-3xl">
                  {specialist.display_name}
                </h1>
                {specialist.room ? <TierBadge tier={specialist.room} withRoom /> : null}
                {specialist.verified ? (
                  <Badge
                    variant="outline"
                    className="gap-1.5 rounded-full border-accent/40 bg-accent/10 text-accent"
                  >
                    <BadgeCheck className="size-3.5" /> Vetted
                  </Badge>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{specialist.headline}</p>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3.5" /> {specialist.city}
                </span>
                <span className="flex items-center gap-1.5">
                  <Star className="size-3.5 text-primary" /> {specialist.rating.toFixed(2)} ·{" "}
                  {specialist.jobs_completed} jobs
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="size-3.5" /> Replies in ~{specialist.response_minutes}m
                </span>
                {specialist.languages.length ? (
                  <span className="flex items-center gap-1.5">
                    <Globe className="size-3.5" /> {specialist.languages.join(", ")}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="w-full sm:w-auto">
              <p className="font-display text-2xl font-semibold">
                {money(specialist.hourly_rate)}
                <span className="text-sm font-normal text-muted-foreground">/hr</span>
              </p>
              <Button
                variant="brass"
                className="mt-3 w-full sm:w-auto"
                disabled={starting}
                onClick={handleStartChat}
              >
                <MessageSquare className="size-4" /> {starting ? "Opening…" : "Start a chat"}
              </Button>
            </div>
          </div>
        </Card>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card className="border-border/70 bg-surface p-6 lg:col-span-2">
            <h2 className="eyebrow">About</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {specialist.bio || "This specialist hasn't added a bio yet."}
            </p>

            <Separator className="my-6" />

            <h2 className="eyebrow">Services offered</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {serviceNames.length ? (
                serviceNames.map((service) => (
                  <Badge key={service} variant="secondary" className="rounded-full font-normal">
                    {service}
                  </Badge>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No services listed yet.</p>
              )}
            </div>

            <Separator className="my-6" />

            <h2 className="eyebrow">Vetting record</h2>
            <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              {[
                "Government ID verified",
                "Background check cleared",
                `${specialist.years_experience} years of verified experience`,
                "Reference calls completed",
                "Signed platform conduct policy",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-accent" />
                  {item}
                </li>
              ))}
            </ul>

            <Separator className="my-6" />

            <h2 className="eyebrow">Member reviews</h2>
            {!reviews || reviews.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No ratings yet — reviews appear here once clients rate completed bookings.
              </p>
            ) : (
              <ul className="mt-3 space-y-4">
                {reviews.slice(0, 5).map((review) => (
                  <li key={review.id} className="border-b border-border/60 pb-3 last:border-0">
                    <div className="flex items-center gap-1 text-primary">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star
                          key={index}
                          className="size-3.5"
                          fill={index < review.stars ? "currentColor" : "none"}
                        />
                      ))}
                    </div>
                    {review.note ? (
                      <p className="mt-1.5 text-sm text-muted-foreground">{review.note}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="h-fit border-border/70 bg-surface p-6">
            <h2 className="eyebrow">Room access</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              {specialist.display_name.split(" ")[0] || "This specialist"} is placed in the{" "}
              <span className="text-foreground">{room?.name ?? "an unassigned room"}</span>. You
              need an active {room?.name.replace(" Room", "") ?? ""} membership or above to book.
            </p>
            <p className="mt-4 font-display text-xl font-semibold">
              {money(room?.priceMonthly ?? 0)}
              <span className="text-sm font-normal text-muted-foreground">/mo</span>
            </p>
            <Button asChild variant="soft" className="mt-4 w-full">
              <Link to="/rooms">View room details</Link>
            </Button>
          </Card>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
