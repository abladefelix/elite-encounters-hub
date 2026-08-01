import { Link } from "@tanstack/react-router";
import { Home, MessageCircle, Sparkles, Layers, User } from "lucide-react";

/**
 * App-style bottom tab bar. Mobile only (hidden from md up), where the
 * desktop header nav takes over.
 */
const TABS = [
  { to: "/", label: "Home", icon: Home },
  { to: "/specialists", label: "Specialists", icon: Sparkles },
  { to: "/messages", label: "Chats", icon: MessageCircle },
  { to: "/rooms", label: "Rooms", icon: Layers },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function MobileTabBar() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/70 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-5">
        {TABS.map((tab) => (
          <li key={tab.to}>
            <Link
              to={tab.to}
              className="flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.625rem] font-medium text-muted-foreground transition-colors active:bg-secondary/60"
              activeProps={{ className: "text-primary" }}
              activeOptions={{ exact: tab.to === "/" }}
            >
              <tab.icon className="size-5" />
              <span className="truncate">{tab.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
