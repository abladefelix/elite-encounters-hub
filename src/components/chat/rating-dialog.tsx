import { useState } from "react";
import { Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RATING_TAGS, STAR_LABEL } from "@/lib/reports";
import { cn } from "@/lib/utils";

export interface RatingDraft {
  stars: number;
  note: string;
  tags: string[];
}

/** In-thread star rating for the specialist a member has been working with. */
export function RatingDialog({
  specialistName,
  open,
  onOpenChange,
  onSubmit,
}: {
  specialistName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: RatingDraft) => void;
}) {
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const shown = hover || stars;

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setStars(0);
      setHover(0);
      setNote("");
      setTags([]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Rate {specialistName.split(" ")[0]}</DialogTitle>
          <DialogDescription>
            Ratings stay on the specialist's Ashnight profile and feed their room review.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border/70 bg-background/50 p-5 text-center">
          <div className="flex items-center justify-center gap-1.5" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                aria-label={`${value} star${value > 1 ? "s" : ""}`}
                onMouseEnter={() => setHover(value)}
                onClick={() => setStars(value)}
                className="p-1 transition-transform hover:scale-110"
              >
                <Star
                  className={cn(
                    "size-8",
                    value <= shown ? "fill-primary text-primary" : "text-muted-foreground/40",
                  )}
                />
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {shown ? STAR_LABEL[shown] : "Tap a star"}
          </p>
        </div>

        <div className="space-y-2">
          <Label>What stood out?</Label>
          <div className="flex flex-wrap gap-1.5">
            {RATING_TAGS.map((tag) => {
              const on = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setTags((current) =>
                      on ? current.filter((item) => item !== tag) : [...current, tag],
                    )
                  }
                >
                  <Badge
                    variant={on ? "default" : "soft"}
                    className="cursor-pointer rounded-full font-normal"
                  >
                    {tag}
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="rating-note">Add a note (optional)</Label>
          <Textarea
            id="rating-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Anything the next member should know?"
            maxLength={500}
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            variant="brass"
            disabled={!stars}
            onClick={() => {
              onSubmit({ stars, note: note.trim(), tags });
              close(false);
            }}
          >
            <Star className="size-4" /> Post rating
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
