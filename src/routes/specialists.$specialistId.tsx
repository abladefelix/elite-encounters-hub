import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  BadgeCheck,
  Clock,
  Globe,
  MapPin,
  MessageSquare,
  Star,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { TierBadge } from "@/components/tier-badge";
import { getRoom, getSpecialist } from "@/lib/mock-data";
import { initials, money } from "@/lib/types";

export const Route = createFileRoute("/specialists/$specialistId")({
  loader: ({ params }) => {
    const specialist = getSpecialist(params.specialistId);
    if (!specialist) throw notFound();
    return { specialist };
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
    const description = `${specialist.name} — ${specialist.headline}. ${specialist.rating.toFixed(2)}★ across ${specialist.jobsCompleted} completed cleans on Ashnight.`;
    return {
      meta: [
        { title: `${specialist.name} — Cleaning Specialist on Ashnight` },
        { name: "description", content: description },
        { property: "og:title", content: `${specialist.name} — Cleaning Specialist` },
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
  const room = getRoom(specialist.room);

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
                {initials(specialist.name)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-2xl font-semibold sm:text-3xl">
                  {specialist.name}
                </h1>
                <TierBadge tier={specialist.room} withRoom />
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
                  {specialist.jobsCompleted} jobs
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="size-3.5" /> Replies in ~{specialist.responseMinutes}m
                </span>
                <span className="flex items-center gap-1.5">
                  <Globe className="size-3.5" /> {specialist.languages.join(", ")}
                </span>
              </div>
            </div>

            <div className="w-full sm:w-auto">
              <p className="font-display text-2xl font-semibold">
                {money(specialist.hourlyRate)}
                <span className="text-sm font-normal text-muted-foreground">/hr</span>
              </p>
              <Button asChild variant="brass" className="mt-3 w-full sm:w-auto">
                <Link to="/messages">
                  <MessageSquare className="size-4" /> Start a chat
                </Link>
              </Button>
            </div>
          </div>
        </Card>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card className="border-border/70 bg-surface p-6 lg:col-span-2">
            <h2 className="eyebrow">About</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{specialist.bio}</p>

            <Separator className="my-6" />

            <h2 className="eyebrow">Services offered</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {specialist.services.map((service: string) => (
                <Badge key={service} variant="secondary" className="rounded-full font-normal">
                  {service}
                </Badge>
              ))}
            </div>

            <Separator className="my-6" />

            <h2 className="eyebrow">Vetting record</h2>
            <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              {[
                "Government ID verified",
                "Background check cleared",
                `${specialist.yearsExperience} years of verified experience`,
                "Two reference calls completed",
                "Signed platform conduct policy",
                "Insurance documents on file",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-accent" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="h-fit border-border/70 bg-surface p-6">
            <h2 className="eyebrow">Room access</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              {specialist.name.split(" ")[0]} is placed in the{" "}
              <span className="text-foreground">{room?.name}</span>. You need an active{" "}
              {room?.name.replace(" Room", "")} membership or above to book.
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
