/**
 * "Rate your visit" prompts for clients. Every completed, paid job appears here
 * until it has been reviewed, because room placement is decided from these
 * ratings rather than from anything a specialist claims about themselves.
 */
import { useMemo, useState } from "react";
import { Star, Trophy } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RatingDialog, type RatingDraft } from "@/components/chat/rating-dialog";
import {
  useBookings,
  useEscrowEntries,
  useMyRatings,
  useProfilesByIds,
  useStoredMedia,
  useSubmitRating,
} from "@/lib/queries";
import { pendingReviews, type PendingReview } from "@/lib/ratings";
import { initials, money } from "@/lib/types";
import { formatStamp } from "@/lib/utils";

export function PendingFeedbackCard({ userId }: { userId: string }) {
  const bookingsQuery = useBookings();
  const escrowQuery = useEscrowEntries();
  const ratingsQuery = useMyRatings(userId);
  const submitRating = useSubmitRating();
  const [active, setActive] = useState<PendingReview | null>(null);

  const pending = useMemo(
    () =>
      pendingReviews({
        userId,
        bookings: bookingsQuery.data ?? [],
        escrows: escrowQuery.data ?? [],
        ratings: ratingsQuery.data ?? [],
      }),
    [userId, bookingsQuery.data, escrowQuery.data, ratingsQuery.data],
  );

  const peopleQuery = useProfilesByIds(pending.map((item) => item.specialistId));
  const peopleById = useMemo(() => {
    const map = new Map<string, { display_name: string; avatar_url: string | null }>();
    for (const person of peopleQuery.data ?? []) map.set(person.id, person);
    return map;
  }, [peopleQuery.data]);

  // Avatars live in a private bucket, so stored paths need signing first.
  const avatarPaths = useMemo(
    () =>
      (peopleQuery.data ?? [])
        .map((person) => person.avatar_url)
        .filter((path): path is string => Boolean(path))
        .map((value) => ({ bucket: "avatars" as const, value })),
    [peopleQuery.data],
  );
  const { data: media } = useStoredMedia(avatarPaths);

  if (!pending.length) return null;

  function submit(draft: RatingDraft) {
    if (!active) return;
    submitRating.mutate(
      {
        rater_id: userId,
        rated_id: active.specialistId,
        booking_id: active.bookingId,
        thread_id: active.threadId,
        stars: draft.stars,
        note: draft.note,
        tags: draft.tags,
      },
      {
        onSuccess: () => {
          toast.success("Thanks — your rating is on the record", {
            description: "Ashnight uses it when reviewing this specialist's room.",
          });
          setActive(null);
        },
        onError: (error) =>
          toast.error("Couldn't post that rating", { description: error.message }),
      },
    );
  }

  const activePerson = active ? peopleById.get(active.specialistId) : undefined;

  return (
    <>
      <Card className="mt-4 border-primary/30 bg-surface p-5">
        <p className="flex items-center gap-2 text-xs text-primary">
          <Trophy className="size-3.5" /> Rate your finished visits
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {pending.length} visit{pending.length === 1 ? "" : "s"} waiting on your feedback. Ratings
          decide which room a specialist works in, so they only count from members who paid for the
          job.
        </p>

        <ul className="mt-4 space-y-2">
          {pending.slice(0, 4).map((item) => (
            <PendingRow
              key={`${item.bookingId ?? item.specialistId}-${item.at}`}
              item={item}
              person={peopleById.get(item.specialistId)}
              media={media}
              onRate={() => setActive(item)}
            />
          ))}
        </ul>
      </Card>

      {active ? (
        <RatingDialog
          open
          specialistName={activePerson?.display_name ?? "your specialist"}
          serviceName={active.serviceName}
          submitting={submitRating.isPending}
          onOpenChange={(next) => {
            if (!next) setActive(null);
          }}
          onSubmit={submit}
        />
      ) : null}
    </>
  );
}

function PendingRow({
  item,
  person,
  media,
  onRate,
}: {
  item: PendingReview;
  person: { display_name: string; avatar_url: string | null } | undefined;
  media: Record<string, string> | undefined;
  onRate: () => void;
}) {
  const avatar = person?.avatar_url ? media?.[person.avatar_url] : undefined;
  const name = person?.display_name ?? "Ashnight specialist";

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-background/50 p-3">
      <Avatar className="size-9">
        {avatar ? <AvatarImage src={avatar} alt={name} /> : null}
        <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{item.serviceName}</p>
        <p className="text-[11px] text-muted-foreground">
          {name} · {money(item.amount)} · {formatStamp(item.at)}
        </p>
      </div>
      <Button variant="brass" size="sm" className="ml-auto" onClick={onRate}>
        <Star className="size-4" /> Rate visit
      </Button>
    </li>
  );
}
