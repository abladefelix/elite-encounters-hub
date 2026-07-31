import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { IconContainer } from "@/components/ui/icon-container";
import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  trend,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "soft" | "accent" | "warning" | "destructive" | "success";
  trend?: { value: number; label?: string };
  className?: string;
}) {
  const TrendIcon = trend
    ? trend.value > 0
      ? TrendingUp
      : trend.value < 0
        ? TrendingDown
        : Minus
    : null;

  return (
    <Card
      className={cn(
        "group relative overflow-hidden p-5 hover:shadow-elevated",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="mt-3 font-display text-2xl font-semibold tracking-tight">{value}</p>
          {hint || trend ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {hint ? <span>{hint}</span> : null}
              {trend ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium",
                    trend.value > 0 && "bg-success/15 text-success",
                    trend.value < 0 && "bg-destructive/15 text-destructive",
                    trend.value === 0 && "bg-muted text-muted-foreground",
                  )}
                >
                  {TrendIcon && <TrendIcon className="size-3" />}
                  {Math.abs(trend.value)}%
                  {trend.label ? <span className="opacity-70">· {trend.label}</span> : null}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <IconContainer icon={icon} tone={tone} />
      </div>
    </Card>
  );
}
