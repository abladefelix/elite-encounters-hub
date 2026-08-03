import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Menu } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/types";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { useRoomSettings } from "@/lib/room-settings";
import { useFeatureFlags } from "@/lib/feature-flags";
import { useAuth } from "@/hooks/use-auth";
import { useBranding } from "@/lib/branding";
import { useCopy } from "@/lib/locale";

const NAV = [
  { to: "/specialists", copyKey: "nav.specialists" },
  { to: "/rooms", copyKey: "nav.rooms" },
  { to: "/messages", copyKey: "nav.messages" },
  { to: "/wallet", copyKey: "nav.wallet" },
  { to: "/how-it-works", copyKey: "nav.howItWorks" },
] as const;

export function SiteHeader() {
  const { platform } = useRoomSettings();
  const { flags } = useFeatureFlags();
  const { user, profile, signOut } = useAuth();
  const { branding } = useBranding();
  const { t } = useCopy();
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
          {branding.name} is in maintenance — bookings, payments and calls may be briefly unavailable.
        </p>
      ) : null}
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-5 md:h-16">
        <Link to="/" className="flex items-center gap-2">
          <BrandMark />
          <span className="font-display text-lg font-semibold tracking-tight">
            {branding.name}
          </span>
        </Link>

        <nav className="ml-6 hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              {t(item.copyKey)}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {platform.memberThemeChoice ? <ThemeToggle /> : null}
          <NotificationBell />

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
                <Link to="/apply" search={{ role: "client" }}>Apply to join</Link>
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
              <nav className="mt-12 flex flex-col gap-1">

                {[
                  ...NAV,
                  ...(user
                    ? ([{ to: "/profile", copyKey: "nav.profile" }] as const)
                    : ([
                        { to: "/auth", copyKey: "action.signIn" },
                        { to: "/apply", copyKey: "nav.apply" },
                      ] as const)),
                ].map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                    activeProps={{ className: "bg-secondary text-foreground" }}
                  >
                    {t(item.copyKey, item.copyKey === "nav.profile" ? "Your profile" : "Apply to join")}
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
