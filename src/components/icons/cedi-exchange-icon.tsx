import { cn } from "@/lib/utils";

interface CediExchangeIconProps {
  className?: string;
  size?: number;
}

export function CediExchangeIcon({ className, size = 24 }: CediExchangeIconProps) {
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
      {/* Outer circular arrows */}
      <path d="M20.5 10.5a9 9 0 1 0-2.3 5.8" />
      <path d="M22 8v3h-3" />
      <path d="M3.5 13.5a9 9 0 1 0 2.3-5.8" />
      <path d="M2 16v-3h3" />
      {/* Inner circle */}
      <circle cx="12" cy="12" r="4" />
      {/* Cedi sign */}
      <path d="M13.5 9.5h-2a1.5 1.5 0 0 0-1.5 1.5v2a1.5 1.5 0 0 0 1.5 1.5h2" />
      <path d="M11 8v8" />
    </svg>
  );
}
