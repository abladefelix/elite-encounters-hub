import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  CreditCard,
  MessageSquare,
  PhoneCall,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconContainer } from "@/components/ui/icon-container";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SpecialistCard } from "@/components/specialist-card";
import { TierBadge } from "@/components/tier-badge";
import { rooms, specialists } from "@/lib/mock-data";
import { money } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ashnight — Members-Only Vetted Cleaning Services" },
      {
        name: "description",
        content:
          "Ashnight is a members-only cleaning platform. Manually vetted specialists, tiered membership rooms, in-chat booking, calls and secure payments.",
      },
      { property: "og:title", content: "Ashnight — Members-Only Vetted Cleaning Services" },
      {
        property: "og:description",
        content:
          "Manually vetted cleaning specialists, tiered rooms, in-chat booking, video walkthroughs and secure on-platform payments.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const featured = specialists.filter((s) => s.rating >= 4.9).slice(0, 3);

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
            Cleaning specialists you'd actually{" "}
            <span className="text-brass">trust with your keys.</span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Ashnight is a members-only platform for residential and commercial cleaning. We
            interview, ID-check and reference-check every specialist by hand, then place them in
            a room that matches their standard of work.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg" variant="brass">
              <Link to="/apply">
                Apply for membership <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="soft">
              <Link to="/specialists">Browse specialists</Link>
            </Button>
          </div>

          <dl className="mt-14 grid max-w-2xl grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { value: "149", label: "Vetted specialists" },
              { value: "4.91", label: "Average rating" },
              { value: "8 min", label: "Median chat reply" },
              { value: "100%", label: "On-platform payments" },
            ].map((stat) => (
              <div key={stat.label}>
                <dt className="font-display text-2xl font-semibold text-foreground">
                  {stat.value}
                </dt>
                <dd className="mt-1 text-xs text-muted-foreground">{stat.label}</dd>
              </div>
            ))}
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
            <Card key={step.title} className="border-border/70 bg-panel p-5">
              <step.icon className="size-5 text-primary" />
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
          {rooms.map((room) => (
            <Card
              key={room.id}
              className="flex flex-col border-border/70 bg-panel p-6 data-[featured=true]:border-primary/40"
              data-featured={room.id === "premium"}
            >
              <TierBadge tier={room.id} withRoom className="self-start" />
              <p className="mt-5 font-display text-3xl font-semibold">
                {money(room.priceMonthly)}
                <span className="text-sm font-normal text-muted-foreground">/mo</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{room.tagline}</p>
              <p className="mt-4 text-xs text-muted-foreground">
                Visit fees {money(room.visitFeeRange[0])}–{money(room.visitFeeRange[1])} · {room.specialistCount}{" "}
                specialists
              </p>
              <ul className="mt-5 space-y-2.5 text-sm">
                {room.perks.slice(0, 4).map((perk) => (
                  <li key={perk} className="flex gap-2 text-muted-foreground">
                    <CalendarCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                    {perk}
                  </li>
                ))}
              </ul>
              <Button asChild variant={room.id === "premium" ? "brass" : "soft"} className="mt-6">
                <Link to="/rooms">See {room.name}</Link>
              </Button>
            </Card>
          ))}
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
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {featured.map((specialist) => (
            <SpecialistCard key={specialist.id} specialist={specialist} />
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 pb-4">
        <Card className="overflow-hidden border-primary/25 bg-hero p-8 sm:p-12">
          <div className="flex flex-wrap items-center justify-between gap-8">
            <div className="max-w-lg">
              <PhoneCall className="size-5 text-primary" />
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
