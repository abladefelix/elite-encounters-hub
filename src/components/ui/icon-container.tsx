import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const toneMap = {
  default: "icon-box",
  soft: "icon-box icon-box-soft",
  accent: "icon-box icon-box-accent",
  warning: "icon-box icon-box-warning",
  destructive: "icon-box icon-box-destructive",
  success: "icon-box icon-box-success",
} as const;

const sizeMap = {
  sm: "icon-box-sm",
  default: "",
  lg: "icon-box-lg",
} as const;

export function IconContainer({
  icon: Icon,
  tone = "default",
  size = "default",
  className,
}: {
  icon: LucideIcon;
  tone?: keyof typeof toneMap;
  size?: keyof typeof sizeMap;
  className?: string;
}) {
  return (
    <span className={cn(toneMap[tone], sizeMap[size], className)}>
      <Icon className="size-[55%]" strokeWidth={2} />
    </span>
  );
}
