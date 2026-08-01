import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Menu, Sparkle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/types";
import { ThemeToggle } from "@/components/theme-toggle";
import { useRoomSettings } from "@/lib/room-settings";
import { useAuth } from "@/hooks/use-auth";

const NAV = [
  { to: "/specialists", label: "Specialists" },
  { to: "/rooms", label: "Rooms" },
  { to: "/messages", label: "Messages" },
  { to: "/how-it-works", label: "How it works" },
] as const;

export function SiteHeader() {
  const { platform } = useRoomSettings();
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const displayName = profile?.display_name ?? user?.email ?? "";

  async function handleSignOut() {
    await signOut();
    void navigate({ to: "/auth" });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      {flags.maintenanceMode ? (
        <p className="bg-destructive px-5 py-1.5 text-center text-[11px] font-medium text-destructive-foreground">
          Ashnight is in maintenance — bookings, payments and calls may be briefly unavailable.
        </p>
      ) : null}
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

          {user ? (
            <>
              <Link to="/profile" aria-label="Your profile" className="hidden sm:flex">
                <Avatar className="size-9 border border-border transition-colors hover:border-primary/50">
                  {profile?.avatar_url ? (
                    <AvatarImage src={profile.avatar_url} alt={displayName} />
                  ) : null}
                  <AvatarFallback className="bg-surface-strong text-xs">
                    {initials(displayName || "Member")}
                  </AvatarFallback>
                </Avatar>
              </Link>
              <Button
                variant="outline"
                size="icon"
                className="hidden sm:inline-flex"
                aria-label="Sign out"
                onClick={() => void handleSignOut()}
              >
                <LogOut className="size-4" />
              </Button>
            </>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
                <Link to="/auth">Sign in</Link>
              </Button>
              <Button asChild size="sm" variant="brass" className="hidden sm:inline-flex">
                <Link to="/apply">Apply to join</Link>
              </Button>
            </>
          )}

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="md:hidden">
                <Menu className="size-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 bg-surface">
              <nav className="mt-8 flex flex-col gap-1">
                {[
                  ...NAV,
                  ...(user
                    ? ([{ to: "/profile", label: "Your profile" }] as const)
                    : ([
                        { to: "/auth", label: "Sign in" },
                        { to: "/apply", label: "Apply to join" },
                      ] as const)),
                ].map((item) => (
                  <Link
                    key={item.label}
                    to={item.to}
                    className="rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                    activeProps={{ className: "bg-secondary text-foreground" }}
                  >
                    {item.label}
                  </Link>
                ))}
                {user ? (
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    className="rounded-md px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    Sign out
                  </button>
                ) : null}
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
