import logo from "@/assets/ashnight-logo.png";
import { cn } from "@/lib/utils";

/**
 * The Ashnight mark — an abstract brass letter A. Single source of truth so the
 * logo can be swapped in one place.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/[0.04] ring-1 ring-brass/25",
        className,
      )}
    >
      <img
        src={logo}
        alt="Ashnight"
        width={1024}
        height={1024}
        className="size-[68%] object-contain"
      />
    </span>
  );
}
