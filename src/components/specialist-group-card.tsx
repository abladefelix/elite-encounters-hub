import { Link } from "@tanstack/react-router";
import { Users, Star, Clock, ShieldCheck, MapPin } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TierBadge } from "@/components/tier-badge";
import { money, type Tier } from "@/lib/types";

interface GroupMember {
  id: string;
  name: string;
  avatarUrl?: string;
}

interface SpecialistGroup {
  id: string;
  name: string;
  headline: string;
  lead: GroupMember;
  members: GroupMember[];
  room: Tier;
  rating: number;
  jobsCompleted: number;
  hourlyRate: number;
  city: string;
}

export function SpecialistGroupCard({ group }: { group: SpecialistGroup }) {
  return (
    <Card className="flex flex-col gap-4 border-border/70 bg-panel p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-elevated">
      <div className="flex items-start gap-3">
        <div className="relative flex -space-x-3">
          <Avatar className="size-12 border-2 border-panel ring-2 ring-border">
            {group.lead.avatarUrl ? <AvatarImage src={group.lead.avatarUrl} /> : null}
            <AvatarFallback>{group.lead.name[0]}</AvatarFallback>
          </Avatar>
          {group.members.slice(0, 2).map((member) => (
            <Avatar key={member.id} className="size-12 border-2 border-panel ring-2 ring-border">
              {member.avatarUrl ? <AvatarImage src={member.avatarUrl} /> : null}
              <AvatarFallback>{member.name[0]}</AvatarFallback>
            </Avatar>
          ))}
          {group.members.length > 2 && (
            <div className="flex size-12 items-center justify-center rounded-full border-2 border-panel bg-surface-strong text-[10px] font-bold ring-2 ring-border">
              +{group.members.length - 2}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 pl-4">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-base font-semibold">{group.name}</h3>
            <ShieldCheck className="size-4 shrink-0 text-accent" />
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" /> {group.city}
          </p>
        </div>

        <TierBadge tier={group.room} showIcon />
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary/80">Led by {group.lead.name}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{group.headline}</p>
      </div>

      <div className="mt-auto grid grid-cols-3 gap-2 border-t border-border/70 pt-4 text-xs">
        <div>
          <p className="flex items-center gap-1 font-display font-semibold text-foreground">
            <Star className="size-3 text-primary" />
            {group.rating.toFixed(2)}
          </p>
          <p className="mt-0.5 text-muted-foreground">{group.jobsCompleted} jobs</p>
        </div>
        <div>
          <p className="flex items-center gap-1 font-display font-semibold text-foreground">
            <Users className="size-3 text-accent" />
            {group.members.length + 1} specialists
          </p>
          <p className="mt-0.5 text-muted-foreground">Collective team</p>
        </div>
        <div>
          <p className="font-display font-semibold text-foreground">{money(group.hourlyRate)}</p>
          <p className="mt-0.5 text-muted-foreground">per hour</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button asChild size="sm" variant="brass" className="flex-1">
          <Link to="/specialists/index">
            View team
          </Link>
        </Button>
        <Button asChild size="sm" variant="soft">
          <Link to="/messages">Message Lead</Link>
        </Button>
      </div>
    </Card>
  );
}
