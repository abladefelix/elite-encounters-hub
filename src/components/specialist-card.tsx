import { Link } from "@tanstack/react-router";
import { Star, MapPin, Clock, ShieldCheck } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TierBadge } from "@/components/tier-badge";
import { initials, money, type Specialist } from "@/lib/types";

export function SpecialistCard({ specialist }: { specialist: Specialist }) {
  return (
    <Card className="flex flex-col gap-4 border-border/70 bg-panel p-5 transition-colors hover:border-primary/30">
      <div className="flex items-start gap-3">
        <div className="relative">
          <Avatar className="size-12 border border-border">
            <AvatarFallback className="bg-surface-strong text-sm font-semibold">
              {initials(specialist.name)}
            </AvatarFallback>
          </Avatar>
          {specialist.online ? (
            <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-card bg-success" />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-base font-semibold">{specialist.name}</h3>
            {specialist.verified ? (
              <ShieldCheck className="size-4 shrink-0 text-accent" />
            ) : null}
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" /> {specialist.city}
          </p>
        </div>

        <TierBadge tier={specialist.room} />
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">{specialist.headline}</p>

      <div className="flex flex-wrap gap-1.5">
        {specialist.services.slice(0, 3).map((service) => (
          <Badge key={service} variant="secondary" className="rounded-full font-normal">
            {service}
          </Badge>
        ))}
      </div>

      <div className="mt-auto grid grid-cols-3 gap-2 border-t border-border/70 pt-4 text-xs">
        <Stat
          icon={<Star className="size-3 text-primary" />}
          value={specialist.rating.toFixed(2)}
          label={`${specialist.jobsCompleted} jobs`}
        />
        <Stat
          icon={<Clock className="size-3 text-accent" />}
          value={`${specialist.responseMinutes}m`}
          label="replies in"
        />
        <Stat value={`${money(specialist.hourlyRate)}`} label="per hour" />
      </div>

      <div className="flex gap-2">
        <Button asChild size="sm" variant="brass" className="flex-1">
          <Link to="/specialists/$specialistId" params={{ specialistId: specialist.id }}>
            View profile
          </Link>
        </Button>
        <Button asChild size="sm" variant="soft">
          <Link to="/messages">Message</Link>
        </Button>
      </div>
    </Card>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon?: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 font-display font-semibold text-foreground">
        {icon}
        {value}
      </p>
      <p className="mt-0.5 text-muted-foreground">{label}</p>
    </div>
  );
}
