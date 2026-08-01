import { cn } from "@/lib/utils";
import { useBranding } from "@/lib/branding";

/**
 * The Ashnight mark — two interlocking discs in brass, one large and one small.
 * Both are solid; the smaller disc carries an outline ring around it and is
 * separated from the larger disc by a thin knock-out gap so the interlock reads
 * at any size. No frame, no plate — the mark sits directly on the surface.
 *
 * When an admin uploads/pastes a logo URL in the control room, that image is
 * rendered instead — this stays the single swap point for the logo.
 */
export function BrandMark({
  className,
  logoUrl,
  alt,
}: {
  className?: string;
  /** Overrides the admin setting; used by the control-room preview. */
  logoUrl?: string;
  alt?: string;
}) {
  const { branding } = useBranding();
  const src = (logoUrl ?? branding.logoUrl ?? "").trim();
  const label = (alt ?? branding.logoAlt ?? "").trim() || branding.name || "Ashnight";

  if (src) {
    return (
      <img
        src={src}
        alt={label}
        loading="lazy"
        className={cn("size-8 shrink-0 object-contain", className)}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={label}
      className={cn("size-8 shrink-0 text-primary", className)}
      fill="none"
    >
      <defs>
        {/* Knock a gap out of the large disc where the small one crosses it. */}
        <mask id="ashnight-mark-gap">
          <rect width="100" height="100" fill="#fff" />
          <circle cx="69" cy="34" r="27" fill="#000" />
        </mask>
      </defs>

      {/* Large solid disc */}
      <circle cx="40" cy="60" r="30" fill="currentColor" mask="url(#ashnight-mark-gap)" />

      {/* Small solid disc, ringed */}
      <circle cx="69" cy="34" r="15" fill="currentColor" />
      <circle cx="69" cy="34" r="21.5" stroke="currentColor" strokeWidth="5" />
    </svg>
  );
}
