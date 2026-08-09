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
    <Card className="mt-6 border-border/70 bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="eyebrow text-primary">
            <Sparkles className="mr-1.5 inline size-3" /> Your Ashnight today
          </p>
          <h2 className="mt-0.5 truncate font-display text-base font-semibold sm:text-lg">
            Welcome back, {firstName}
          </h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button asChild size="sm" variant="brass">
            <Link to="/messages">
              <MessageCircle className="size-4" /> Chats
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
                <Sparkles className="size-4" /> Find
              </Link>
            </Button>
          )}
          <Button asChild size="sm" variant="outline">
            <Link to="/support" search={{ tab: "complaints" }}>Inbox</Link>
          </Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat
          icon={MessageCircle}
          label="Unread"
          value={unread ? `${unread}` : "0"}
          hint={`${threads.length} thread${threads.length === 1 ? "" : "s"}`}
        />
        <Stat
          icon={isSpecialist ? Timer : Wallet}
          label="In escrow"
          value={money(holding)}
          hint={isSpecialist ? "Auto-releases" : "On confirm"}
        />
        <Stat
          icon={CalendarClock}
          label="Next visit"
          value={nextVisit ? nextVisit.service_name : "None"}
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
    <div className="rounded-lg border border-border bg-background/40 p-2.5">
      <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Icon className="size-3 shrink-0" /> <span className="truncate">{label}</span>
      </p>
      <p className="mt-1 truncate font-display text-sm font-semibold sm:text-base">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

