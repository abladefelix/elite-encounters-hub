/**
 * Waiting room shown to members whose account is still being vetted.
 *
 * Instead of dropping an un-approved member into an empty dashboard, this gives
 * them something to do: finish their profile, learn how Ashnight works, read the
 * house rules, and see exactly where their review stands.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  Banknote,
  Check,
  Clock,
  Image as ImageIcon,
  LifeBuoy,
  MapPin,
  MessageSquare,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/hooks/use-auth";
import { useRoomSettings } from "@/lib/room-settings";
import { money, tierLabel } from "@/lib/types";

type Step = { key: string; label: string; blurb: string };

const STEPS: Step[] = [
  { key: "submitted", label: "Application received", blurb: "Your details are in the queue." },
  { key: "in_review", label: "Under review", blurb: "A vetting officer is checking your profile." },
  { key: "approved", label: "Approved", blurb: "Full access to chat, rooms and bookings." },
];

function StatusTimeline({ vetting }: { vetting: string }) {
  const activeIndex = vetting === "approved" ? 2 : vetting === "in_review" ? 1 : 0;

  return (
    <ol className="space-y-4">
      {STEPS.map((step, index) => {
        const done = index < activeIndex;
        const current = index === activeIndex;
        return (
          <li key={step.key} className="flex gap-3">
            <span
              className={[
                "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                done
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : current
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted text-muted-foreground",
              ].join(" ")}
            >
              {done ? <Check className="size-3.5" /> : index + 1}
            </span>
            <div className="min-w-0">
              <p className={`text-sm font-medium ${current ? "" : "text-muted-foreground"}`}>
                {step.label}
              </p>
              <p className="text-xs text-muted-foreground">{step.blurb}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function useChecklist() {
  const { profile, isSpecialist } = useAuth();

  return useMemo(() => {
    const items = [
      {
        key: "avatar",
        label: "Add a clear profile photo",
        icon: ImageIcon,
        done: Boolean(profile?.avatar_url),
      },
      {
        key: "bio",
        label: "Write a short bio",
        icon: UserRound,
        done: (profile?.bio ?? "").trim().length >= 40,
      },
      {
        key: "location",
        label: "Confirm your location",
        icon: MapPin,
        done: Boolean(profile?.locality || profile?.city),
      },
      {
        key: "likes",
        label: "Pick your likes and dislikes",
        icon: Sparkles,
        done: Boolean((profile?.likes ?? []).length || (profile?.dislikes ?? []).length),
      },
    ];

    if (isSpecialist) {
      items.push(
        {
          key: "rate",
          label: "Set your hourly rate",
          icon: Banknote,
          done: Number(profile?.hourly_rate ?? 0) > 0,
        },
        {
          key: "card",
          label: "Upload your Ghana Card",
          icon: BadgeCheck,
          done: Boolean(profile?.ghana_card_front_url && profile?.ghana_card_back_url),
        },
      );
    }

    const complete = items.filter((item) => item.done).length;
    return { items, complete, total: items.length };
  }, [profile, isSpecialist]);
}

function ProfileChecklist() {
  const { items, complete, total } = useChecklist();
  const percent = Math.round((complete / total) * 100);

  return (
    <Card className="border-border/70 bg-panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">Finish your profile</h2>
          <p className="text-xs text-muted-foreground">
            Complete profiles get reviewed first.
          </p>
        </div>
        <span className="font-display text-lg font-semibold text-primary">{percent}%</span>
      </div>
      <Progress value={percent} className="mt-3 h-2" />
      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-3 text-sm">
            <span
              className={[
                "flex size-7 shrink-0 items-center justify-center rounded-lg border",
                item.done
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-background/50 text-muted-foreground",
              ].join(" ")}
            >
              {item.done ? <Check className="size-3.5" /> : <item.icon className="size-3.5" />}
            </span>
            <span className={item.done ? "text-muted-foreground line-through" : ""}>
              {item.label}
            </span>
          </li>
        ))}
      </ul>
      <Button asChild variant="brass" size="sm" className="mt-4 w-full">
        <Link to="/profile">{complete === total ? "Review my profile" : "Complete my profile"}</Link>
      </Button>
    </Card>
  );
}

function RoomsPeek() {
  const { roomIds, profileOf } = useRoomSettings();
  const list = roomIds.slice(0, 3);
  if (!list.length) return null;

  return (
    <Card className="border-border/70 bg-panel p-5">
      <h2 className="font-display text-base font-semibold">Rooms you can join once approved</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {list.map((tier) => {
          const info = profileOf(tier);
          return (
            <div key={tier} className="rounded-xl border border-border/60 bg-background/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-sm font-semibold">{tierLabel(tier)}</p>
                <Badge variant="outline" className="text-[0.65rem]">
                  {money(info.priceMonthly)}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{info.tagline}</p>
            </div>
          );
        })}
      </div>
      <Button asChild variant="soft" size="sm" className="mt-4">
        <Link to="/rooms">Preview the rooms</Link>
      </Button>
    </Card>
  );
}

const TIPS = [
  {
    icon: ShieldCheck,
    title: "Everyone is vetted",
    body: "Every member and specialist passes a manual identity check before they can chat.",
  },
  {
    icon: Banknote,
    title: "Money sits in escrow",
    body: "Payments are held safely and only released after the service is confirmed complete.",
  },
  {
    icon: MessageSquare,
    title: "Keep it on Ashnight",
    body: "Chat, calls and payments stay in the app — sharing contact details is blocked.",
  },
];

const FAQ = [
  {
    q: "How long does approval take?",
    a: "Most reviews finish within a few hours. If our team needs anything extra, you will get a notification in the app.",
  },
  {
    q: "Can I browse while I wait?",
    a: "You can explore how Ashnight works and the room options. Chat, calls and bookings unlock the moment you are approved.",
  },
  {
    q: "Why was I asked for a Ghana Card?",
    a: "It is how we confirm you are a real person. Your card details are private and never shown to other members.",
  },
  {
    q: "What if something looks wrong on my account?",
    a: "Open Support and file a complaint — the team replies inside the app.",
  },
];

export function PendingApprovalHome() {
  const { profile, isSpecialist } = useAuth();
  const [showAllFaq, setShowAllFaq] = useState(false);
  const firstName = (profile?.display_name ?? "there").split(" ")[0];
  const vetting = profile?.vetting ?? "pending";
  const faq = showAllFaq ? FAQ : FAQ.slice(0, 2);

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      <SiteHeader />

      <main className="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-5 sm:pt-6">
        <Card className="border-primary/25 bg-primary/5 p-5">
          <Badge variant="outline" className="border-primary/40 text-primary">
            <Clock className="mr-1 size-3" />
            {vetting === "in_review" ? "Under review" : "Awaiting review"}
          </Badge>
          <h1 className="mt-3 font-display text-2xl font-semibold">
            Welcome, {firstName} — you are almost in
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSpecialist
              ? "Our vetting team is checking your details. Use this time to make your profile shine — it is the first thing members see."
              : "Our vetting team is checking your details. Meanwhile, get your profile ready so you can start chatting the moment you are approved."}
          </p>
          {profile?.status_reason ? (
            <p className="mt-3 rounded-lg border border-border/60 bg-background/50 p-3 text-xs text-muted-foreground">
              Note from the team: {profile.status_reason}
            </p>
          ) : null}
        </Card>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <ProfileChecklist />
          <Card className="border-border/70 bg-panel p-5">
            <h2 className="font-display text-base font-semibold">Where your review stands</h2>
            <div className="mt-4">
              <StatusTimeline vetting={vetting} />
            </div>
          </Card>
        </div>

        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          {TIPS.map((tip) => (
            <Card key={tip.title} className="border-border/70 bg-panel p-4">
              <tip.icon className="size-5 text-primary" />
              <p className="mt-2 font-display text-sm font-semibold">{tip.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{tip.body}</p>
            </Card>
          ))}
        </section>

        {!isSpecialist ? (
          <section className="mt-6">
            <RoomsPeek />
          </section>
        ) : null}

        <Card className="mt-6 border-border/70 bg-panel p-5">
          <h2 className="font-display text-base font-semibold">While you wait</h2>
          <Accordion type="single" collapsible className="mt-2">
            {faq.map((item) => (
              <AccordionItem key={item.q} value={item.q}>
                <AccordionTrigger className="text-left text-sm">{item.q}</AccordionTrigger>
                <AccordionContent className="text-xs text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          {!showAllFaq ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setShowAllFaq(true)}
            >
              More questions
            </Button>
          ) : null}
        </Card>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Button asChild variant="soft">
            <Link to="/how-it-works">
              <Search className="mr-2 size-4" />
              How Ashnight works
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/support" search={{ tab: "complaints" }}>
              <LifeBuoy className="mr-2 size-4" />
              Talk to support
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
