import { cn } from "@/lib/utils";

interface CediIconProps {
  className?: string;
  size?: number;
}

export function CediIcon({ className, size = 24 }: CediIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <text
        x="12"
        y="16.5"
        textAnchor="middle"
        fontSize="12"
        fontWeight="600"
        fill="currentColor"
        stroke="none"
      >
        ₵
      </text>
    </svg>
  );
}
