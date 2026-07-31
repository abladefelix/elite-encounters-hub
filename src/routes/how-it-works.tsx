import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarCheck,
  CreditCard,
  FileCheck2,
  MessageSquare,
  PhoneCall,
  ShieldCheck,
  Star,
  UserCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const CLIENT_STEPS = [
  {
    icon: FileCheck2,
    title: "Apply",
    body: "Tell us about your property, the cleaning you need and how often. Upload a government ID for verification.",
  },
  {
    icon: UserCheck,
    title: "Get vetted",
    body: "Our trust & safety team reviews your application by hand. No automated approvals, ever.",
  },
  {
    icon: CreditCard,
    title: "Subscribe to a room",
    body: "Clients choose a paid room — Basic, Premium or Ultimate. Your room decides which specialists you can book and how fast you can schedule.",
  },
  {
    icon: MessageSquare,
    title: "Scope the job in chat",
    body: "Message a specialist, share photos of the space, and agree on exactly what's included.",
  },
  {
    icon: PhoneCall,
    title: "Call or video walkthrough",
    body: "Premium and Ultimate members can start a voice or video call in the thread for a live walkthrough.",
  },
  {
    icon: CalendarCheck,
    title: "Request, pay, done",
    body: "Hit Request service in the chat, review the itemised quote, and pay. Funds release after you confirm the job is complete.",
  },
];

const SPECIALIST_STEPS = [
  {
    title: "Application & interview",
    body: "Work history, specialisms, insurance status and availability, followed by a video interview with our team.",
  },
  {
    title: "ID & background check",
    body: "Government ID verification plus a background check. Anything flagged is reviewed by trust & safety before a decision.",
  },
  {
    title: "Reference calls",
    body: "We call previous clients or employers directly. Ultimate placement requires at least three clean references.",
  },
  {
    title: "Room placement",
    body: "Our team places you in Basic, Premium or Ultimate based on experience, standard of work and the services you're cleared for.",
  },
  {
    title: "Ongoing quality review",
    body: "Ratings, disputes and cancellations are reviewed monthly. Rooms can be upgraded — or downgraded — accordingly.",
  },
];

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How Ashnight Works — Vetting, Rooms & In-Chat Booking" },
      {
        name: "description",
        content:
          "How Ashnight works: manual vetting for every member, room placement by subscription and experience, and booking plus payment inside the chat thread.",
      },
      { property: "og:title", content: "How Ashnight Works" },
      {
        property: "og:description",
        content:
          "Manual vetting, room placement, in-chat scoping with voice and video calls, then a single button to request and pay for a clean.",
      },
    ],
  }),
  component: HowItWorks,
});

function HowItWorks() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      <div className="mx-auto w-full max-w-5xl px-5 py-12">
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">How Ashnight works</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Ashnight is closed by design. Both sides of every booking are vetted by a person before
          they can message anyone, and all scheduling and payment stays on the platform so there's
          always a record.
        </p>

        <h2 className="eyebrow mt-14">For clients</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CLIENT_STEPS.map((step, index) => (
            <Card key={step.title} className="border-border/70 bg-panel p-5">
              <div className="flex items-center justify-between">
                <step.icon className="size-5 text-primary" />
                <span className="font-display text-xs text-muted-foreground">
                  0{index + 1}
                </span>
              </div>
              <h3 className="mt-4 font-display text-base font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </Card>
          ))}
        </div>

        <h2 className="eyebrow mt-16">For specialists — the vetting pipeline</h2>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Specialists never pay to join Ashnight. There's no membership fee and no application
          charge — you're placed in a room after vetting and earn from every booking, minus the
          platform fee.
        </p>
        <Card className="mt-6 border-border/70 bg-surface p-6 sm:p-8">
          <ol className="space-y-6">
            {SPECIALIST_STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-full border border-primary/30 bg-primary/10 font-display text-sm font-semibold text-primary">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-display text-base font-semibold">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: ShieldCheck,
              title: "Payments held on-platform",
              body: "Money is held from payment until you confirm the job is finished. Disputes are handled by our team.",
            },
            {
              icon: Star,
              title: "Ratings that matter",
              body: "Ratings drive room placement, so specialists have a real incentive to keep their standard high.",
            },
            {
              icon: MessageSquare,
              title: "One thread per relationship",
              body: "Chat, calls, quotes, bookings and receipts all live in the same thread. Nothing moves off-platform.",
            },
          ].map((item) => (
            <Card key={item.title} className="border-border/70 bg-panel p-5">
              <item.icon className="size-5 text-accent" />
              <h3 className="mt-4 font-display text-base font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </Card>
          ))}
        </div>

        <Card className="mt-14 border-primary/25 bg-hero p-8">
          <h2 className="font-display text-2xl font-semibold">Ready to apply?</h2>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">
            Applications are reviewed within two business days. You'll hear from us either way.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild variant="brass">
              <Link to="/apply">Start an application</Link>
            </Button>
            <Button asChild variant="soft">
              <Link to="/rooms">Compare rooms</Link>
            </Button>
          </div>
        </Card>
      </div>

      <SiteFooter />
    </div>
  );
}
