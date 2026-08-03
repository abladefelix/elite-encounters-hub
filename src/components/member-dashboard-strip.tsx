import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Banknote, CalendarClock, MessageCircle, Sparkles, Timer, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useBookings, useEscrowEntries, useThreads } from "@/lib/queries";
import { money } from "@/lib/types";
import { formatStamp } from "@/lib/utils";

/**
 * Signed-in "what's happening" strip: unread chats, money in escrow, the next
 * booked visit, and the actions members reach for most.
 */
export function MemberDashboardStrip() {
  const { user, profile, isSpecialist } = useAuth();
  const threadsQuery = useThreads(user?.id);
  const escrowQuery = useEscrowEntries();
  const bookingsQuery = useBookings();

  const threads = useMemo(() => threadsQuery.data ?? [], [threadsQuery.data]);
  const entries = useMemo(() => escrowQuery.data ?? [], [escrowQuery.data]);
  const bookings = useMemo(() => bookingsQuery.data ?? [], [bookingsQuery.data]);

  if (!user) return null;

  const unread = threads.filter((thread) => {
    const mine = thread.client_id === user.id;
    const lastRead = mine ? thread.client_last_read_at : thread.specialist_last_read_at;
    return new Date(thread.last_message_at) > new Date(lastRead);
  }).length;

  const holding = entries
    .filter((entry) => entry.state === "held" || entry.state === "clearing")
    .reduce((sum, entry) => sum + (isSpecialist ? entry.payout_amount : entry.amount), 0);

  const nextVisit = bookings
    .filter(
      (booking) =>
        booking.scheduled_for &&
        new Date(booking.scheduled_for) > new Date() &&
        booking.status !== "cancelled",
    )
    .sort(
      (a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime(),
    )[0];

  const firstName = (profile?.display_name ?? "there").split(" ")[0];

  return (
    <Card className="mt-8 border-border/70 bg-panel p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-primary">
            <Sparkles className="mr-1.5 inline size-3.5" /> Your Ashnight today
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold">Welcome back, {firstName}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="brass">
            <Link to="/messages">
              <MessageCircle className="size-4" /> Open chats
            </Link>
          </Button>
          {isSpecialist ? (
            <Button asChild size="sm" variant="soft">
              <Link to="/wallet">
                <Banknote className="size-4" /> Earnings
              </Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="soft">
              <Link to="/specialists">
                <Sparkles className="size-4" /> Find a specialist
              </Link>
            </Button>
          )}
          <Button asChild size="sm" variant="outline">
            <Link to="/support" search={{ tab: "complaint" }}>Inbox &amp; documents</Link>
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Stat
          icon={MessageCircle}
          label="Unread conversations"
          value={unread ? `${unread} waiting` : "All caught up"}
          hint={`${threads.length} thread${threads.length === 1 ? "" : "s"} in total`}
        />
        <Stat
          icon={isSpecialist ? Timer : Wallet}
          label={isSpecialist ? "Waiting in escrow" : "Held in escrow"}
          value={money(holding)}
          hint={
            isSpecialist
              ? "Releases automatically after the hold window"
              : "Released when you confirm the visit"
          }
        />
        <Stat
          icon={CalendarClock}
          label="Next booked visit"
          value={nextVisit ? nextVisit.service_name : "Nothing scheduled"}
          hint={nextVisit?.scheduled_for ? formatStamp(nextVisit.scheduled_for) : "Book in chat"}
        />
      </div>
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof MessageCircle;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-4">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </p>
      <p className="mt-1.5 truncate font-display text-lg font-semibold">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
