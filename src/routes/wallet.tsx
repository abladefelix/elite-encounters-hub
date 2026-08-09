import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownLeft,
  Banknote,
  FileText,
  Loader2,
  ShieldCheck,
  Timer,
  Wallet as WalletIcon,
} from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { PendingFeedbackCard } from "@/components/pending-feedback-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { requestEscrowPayout } from "@/lib/payments.functions";
import type { EscrowRow } from "@/lib/queries";
import { useBookings, useEscrowEntries, useMemberships } from "@/lib/queries";
import { useDocuments } from "@/lib/support";
import { money, tierLabel } from "@/lib/types";
import { formatStamp } from "@/lib/utils";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Your money · Ashnight escrow, payouts and receipts" },
      {
        name: "description",
        content:
          "Track Ashnight escrow holds, released payouts, refunds, bookings and every invoice or receipt attached to your account.",
      },
      { property: "og:title", content: "Your money · Ashnight" },
      {
        property: "og:description",
        content:
          "Escrow holds, payouts, refunds and receipts for your Ashnight bookings, all in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WalletPage,
});

const STATE_TONE: Record<string, string> = {
  pending: "border-border text-muted-foreground",
  held: "border-primary/40 text-primary",
  clearing: "border-accent/40 text-accent",
  released: "border-emerald-500/40 text-emerald-500",
  disputed: "border-destructive/40 text-destructive",
  refunded: "border-border text-muted-foreground",
};

function WalletPage() {
  const { user, loading, isSpecialist } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-md px-5 py-16 text-center">
          <h1 className="font-display text-xl font-semibold">Sign in to see your money</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Escrow holds, payouts and receipts are private to each Ashnight member.
          </p>
          <Button asChild variant="brass" className="mt-6">
            <Link to="/auth">Sign in to Ashnight</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <WalletBody userId={user.id} isSpecialist={isSpecialist} />;
}

function WalletBody({ userId, isSpecialist }: { userId: string; isSpecialist: boolean }) {
  const escrowQuery = useEscrowEntries();
  const bookingsQuery = useBookings();
  const documentsQuery = useDocuments();
  const membershipsQuery = useMemberships();

  const entries = useMemo(() => escrowQuery.data ?? [], [escrowQuery.data]);
  const bookings = useMemo(() => bookingsQuery.data ?? [], [bookingsQuery.data]);
  const documents = useMemo(() => documentsQuery.data ?? [], [documentsQuery.data]);
  const membership = (membershipsQuery.data ?? []).find((row) => row.user_id === userId);

  const totals = useMemo(() => {
    let holding = 0;
    let released = 0;
    let disputed = 0;
    let refunded = 0;
    let spent = 0;
    for (const entry of entries) {
      const mine = isSpecialist ? entry.payout_amount : entry.amount;
      if (entry.state === "held" || entry.state === "clearing") holding += mine;
      if (entry.state === "released") released += mine;
      if (entry.state === "disputed") disputed += mine;
      if (entry.state === "refunded") refunded += entry.amount;
      if (entry.state !== "pending") spent += entry.amount;
    }
    return { holding, released, disputed, refunded, spent };
  }, [entries, isSpecialist]);

  const cards = isSpecialist
    ? [
        { label: "Cleared earnings", value: totals.released, icon: ArrowDownLeft, hint: "Paid out of escrow" },
        { label: "Waiting in escrow", value: totals.holding, icon: Timer, hint: "Releases after the hold window" },
        { label: "On hold (issues)", value: totals.disputed, icon: ShieldCheck, hint: "Frozen while Ashnight reviews" },
      ]
    : [
        { label: "Held in escrow", value: totals.holding, icon: Timer, hint: "Released once you confirm the visit" },
        { label: "Refunded to you", value: totals.refunded, icon: ArrowDownLeft, hint: "Returned after a resolved issue" },
      ];

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <SiteHeader />

      <main className="mx-auto w-full max-w-5xl px-5 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-primary">
              <WalletIcon className="mr-1.5 inline size-3.5" /> Your money
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
              {isSpecialist ? "Earnings & payouts" : "Payments & escrow"}
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              {isSpecialist
                ? "Every job you're paid for moves through Ashnight escrow. Nothing pays out until the hold window closes with no issues raised."
                : "Ashnight holds your payment in escrow until you confirm the visit went well. Refunds come back the same way."}
            </p>
          </div>
          <Button asChild variant="soft">
            <Link to="/messages">
              <Banknote className="size-4" />
              {isSpecialist ? "Request payment in chat" : "Book in chat"}
            </Link>
          </Button>
        </header>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {cards.map((card) => (
            <Card key={card.label} className="border-border/70 bg-surface p-5">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <card.icon className="size-3.5" /> {card.label}
              </p>
              <p className="mt-2 font-display text-2xl font-semibold">{money(card.value)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{card.hint}</p>
            </Card>
          ))}
        </div>

        {!isSpecialist ? <PendingFeedbackCard userId={userId} /> : null}

        {!isSpecialist ? (
          <Card className="mt-4 flex flex-wrap items-center gap-3 border-border/70 bg-surface p-5">
            <div>
              <p className="text-xs text-muted-foreground">Room membership</p>
              <p className="mt-1 text-sm font-semibold">
                {membership
                  ? `${tierLabel(membership.room)} · ${membership.status}`
                  : "No active membership"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {membership?.current_period_end
                  ? `Renews ${formatStamp(membership.current_period_end)}`
                  : "Join a room to unlock specialists in that tier."}
              </p>
            </div>
            <Button asChild variant="brass" size="sm" className="ml-auto">
              <Link to="/rooms">{membership ? "Manage membership" : "Choose a room"}</Link>
            </Button>
          </Card>
        ) : null}

        <Tabs defaultValue="escrow" className="mt-8">
          <TabsList>
            <TabsTrigger value="escrow">Escrow ledger</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="documents">Invoices & receipts</TabsTrigger>
          </TabsList>

          <TabsContent value="escrow" className="mt-4">
            <Card className="border-border/70 bg-surface p-0">
              {escrowQuery.isLoading ? (
                <Empty>Loading your escrow ledger…</Empty>
              ) : entries.length === 0 ? (
                <Empty>No escrow activity yet.</Empty>
              ) : (
                <ul className="divide-y divide-border/70">
                  {entries.map((entry) => (
                    <li key={entry.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{entry.label}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-foreground/70">
                          {entry.reference}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {entry.kind} · created {formatStamp(entry.created_at)}
                          {entry.released_at
                            ? ` · released ${formatStamp(entry.released_at)}`
                            : entry.release_at
                              ? ` · releases ${formatStamp(entry.release_at)}`
                              : ""}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={STATE_TONE[entry.state] ?? "border-border text-muted-foreground"}
                      >
                        {entry.state}
                      </Badge>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {money(isSpecialist ? entry.payout_amount : entry.amount)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {isSpecialist ? "your payout" : `incl. ${money(entry.platform_fee)} fee`}
                        </p>
                      </div>
                      {isSpecialist ? <PayoutRequest entry={entry} /> : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="bookings" className="mt-4">
            <Card className="border-border/70 bg-surface p-0">
              {bookings.length === 0 ? (
                <Empty>No bookings on your account yet.</Empty>
              ) : (
                <ul className="divide-y divide-border/70">
                  {bookings.map((booking) => (
                    <li key={booking.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{booking.service_name}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-foreground/70">
                          {booking.reference}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {Number(booking.hours)}h · {money(booking.rate)}/h · requested{" "}
                          {formatStamp(booking.created_at)}
                          {booking.scheduled_for
                            ? ` · visit ${formatStamp(booking.scheduled_for)}`
                            : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className="border-border text-muted-foreground">
                        {booking.status}
                      </Badge>
                      <p className="text-sm font-semibold">
                        {money(Number(booking.hours) * booking.rate)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            <Card className="border-border/70 bg-surface p-0">
              {documents.length === 0 ? (
                <Empty>No invoices or receipts issued yet.</Empty>
              ) : (
                <ul className="divide-y divide-border/70">
                  {documents.map((doc) => (
                    <li key={doc.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {doc.number} · {doc.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {doc.kind} · issued {formatStamp(doc.issued_at)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold">{money(doc.total)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <p className="mt-3 text-xs text-muted-foreground">
              Need a printable copy?{" "}
              <Link to="/support" search={{ tab: "complaints" }} className="text-primary underline-offset-4 hover:underline">
                Open your inbox &amp; documents
              </Link>
              .
            </p>
          </TabsContent>
        </Tabs>

        <Separator className="my-8" />
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-accent" />
          Ashnight escrow is the only safe way to pay or get paid here. Payments arranged off-platform
          have no protection and can end a membership.
        </p>
      </main>

      <MobileTabBar />
    </div>
  );
}

/**
 * A paid job leaves the specialist a record she can act on: ask Ashnight to
 * release the escrowed payout. Money still only moves from the control room or
 * when the hold window closes.
 */
function PayoutRequest({ entry }: { entry: EscrowRow }) {
  const requestPayout = useServerFn(requestEscrowPayout);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  if (entry.state === "released") {
    return <span className="w-full text-[11px] text-emerald-500 sm:w-auto">Deposited</span>;
  }
  if (entry.state === "refunded") {
    return <span className="w-full text-[11px] text-muted-foreground sm:w-auto">Refunded</span>;
  }
  if (entry.state === "pending") {
    return <span className="w-full text-[11px] text-muted-foreground sm:w-auto">Awaiting payment</span>;
  }
  if (entry.state === "held") {
    return (
      <span className="w-full text-[11px] text-muted-foreground sm:w-auto">
        Awaiting the member's confirmation
      </span>
    );
  }
  if (entry.state === "disputed") {
    return <span className="w-full text-[11px] text-destructive sm:w-auto">Issue raised — under review</span>;
  }
  if (entry.payout_request_state === "requested") {

    return (
      <Badge variant="outline" className="border-accent/40 text-accent">
        Release requested
      </Badge>
    );
  }

  return (
    <Button
      size="sm"
      variant="soft"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void requestPayout({ data: { escrowId: entry.id } })
          .then(() => {
            toast.success("Release requested", {
              description: "Ashnight will review and deposit your payout.",
            });
            return queryClient.invalidateQueries({ queryKey: ["escrow"] });
          })
          .catch((error: unknown) =>
            toast.error("Couldn't request the release", {
              description: error instanceof Error ? error.message : "Please try again.",
            }),
          )
          .finally(() => setBusy(false));
      }}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Banknote className="size-3.5" />}
      Request release
    </Button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-muted-foreground">{children}</p>;
}
