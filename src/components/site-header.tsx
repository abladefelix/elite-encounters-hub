import { Link } from "@tanstack/react-router";
import { Menu, Sparkle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { currentClient } from "@/lib/mock-data";
import { initials } from "@/lib/types";
import { ThemeToggle } from "@/components/theme-toggle";
import { useRoomSettings } from "@/lib/room-settings";

const NAV = [
  { to: "/specialists", label: "Specialists" },
  { to: "/rooms", label: "Rooms" },
  { to: "/messages", label: "Messages" },
  { to: "/how-it-works", label: "How it works" },
] as const;

export function SiteHeader() {
  const me = currentClient();
  const { platform } = useRoomSettings();



  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-5 md:h-16">

        <Link to="/" className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-brass text-primary-foreground">
            <Sparkle className="size-4" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">Ashnight</span>
        </Link>

        <nav className="ml-6 hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {platform.memberThemeChoice ? <ThemeToggle /> : null}
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/admin">Admin</Link>
          </Button>
          <Button asChild size="sm" variant="brass">
            <Link to="/apply">Apply to join</Link>
          </Button>
          <Avatar className="hidden size-9 border border-border sm:flex">
            <AvatarFallback className="bg-surface-strong text-xs">
              {initials(me.name)}
            </AvatarFallback>
          </Avatar>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="md:hidden">
                <Menu className="size-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 bg-surface">
              <nav className="mt-8 flex flex-col gap-1">
                {[...NAV, { to: "/admin", label: "Admin dashboard" } as const].map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                    activeProps={{ className: "bg-secondary text-foreground" }}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              {platform.memberThemeChoice ? (
                <div className="mt-6 flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2.5">
                  <span className="text-sm text-muted-foreground">Appearance</span>
                  <ThemeToggle />
                </div>
              ) : null}
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
