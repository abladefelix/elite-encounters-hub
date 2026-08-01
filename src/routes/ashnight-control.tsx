import { createFileRoute, Link, Navigate, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  Bell,
  ReceiptText,
  ScrollText,
  BadgeCheck,
  CalendarCheck,
  ClipboardList,
  Database,
  DoorOpen,

  KeyRound,
  ShieldCheck,
  Sparkles,
  ShieldBan,
  LayoutDashboard,
  LifeBuoy,
  Loader2,
  DatabaseBackup,
  Server,
  Mail,
  Rocket,
  LogOut,
  ToggleLeft,
  Menu,
  Palette,
  Users,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useApplications } from "@/lib/queries";
import { initials } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { TwoFactorCard } from "@/components/two-factor-card";
import { useAuth } from "@/hooks/use-auth";
import { useFeatureFlags } from "@/lib/feature-flags";
import { useTwoFactor } from "@/lib/two-factor";


export const Route = createFileRoute("/ashnight-control")({
  component: AdminLayout,
});

const NAV: { to: string; label: string; icon: typeof Users; exact?: boolean }[] = [
  { to: "/ashnight-control", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/ashnight-control/vetting", label: "Vetting queue", icon: BadgeCheck },
  { to: "/ashnight-control/users", label: "Users", icon: Users },
  { to: "/ashnight-control/rooms", label: "Rooms", icon: DoorOpen },
  { to: "/ashnight-control/services", label: "Services", icon: Sparkles },
  { to: "/ashnight-control/bookings", label: "Bookings", icon: CalendarCheck },
  { to: "/ashnight-control/escrow", label: "Escrow & gifts", icon: ShieldCheck },
  { to: "/ashnight-control/moderation", label: "Moderation", icon: ShieldBan },
  { to: "/ashnight-control/complaints", label: "Complaints", icon: LifeBuoy },
  { to: "/ashnight-control/notifications", label: "Notifications", icon: Bell },
  { to: "/ashnight-control/documents", label: "Invoices & receipts", icon: ReceiptText },
  { to: "/ashnight-control/logs", label: "Activity log", icon: ScrollText },
  { to: "/ashnight-control/signup", label: "Sign-up form", icon: ClipboardList },
  { to: "/ashnight-control/features", label: "Features", icon: ToggleLeft },
  { to: "/ashnight-control/branding", label: "Brand & wording", icon: Palette },
  { to: "/ashnight-control/settings", label: "Keys & security", icon: KeyRound },
  { to: "/ashnight-control/email", label: "Email & domain", icon: Mail },
  { to: "/ashnight-control/backups", label: "Backups", icon: DatabaseBackup },
  { to: "/ashnight-control/server", label: "Server & DNS", icon: Server },
  { to: "/ashnight-control/demo", label: "Demo data", icon: Database },
  { to: "/ashnight-control/deploy", label: "Deploy", icon: Rocket },

];

function AdminLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { loading, session, profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    void navigate({ to: "/auth", replace: true });
  }

  const [menuOpen, setMenuOpen] = useState(false);

  const applicationsQuery = useApplications();
  const { flags } = useFeatureFlags();
  const twoFactor = useTwoFactor();
  const pendingVetting = (applicationsQuery.data ?? []).filter(
    (row) => row.status === "pending" || row.status === "in_review",
  ).length;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" />;
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="max-w-sm p-8 text-center">
          <h1 className="font-display text-lg font-semibold">Not authorised</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account doesn't have admin access to the Ashnight control room.
          </p>
        </Card>
      </div>
    );
  }

  // Policy gate: when Ashnight requires 2FA for admins, enrol before anything else.
  if (flags.requireTwoFactorForAdmins && !twoFactor.loading && !twoFactor.enrolled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-lg">
          <p className="eyebrow mb-3 text-center text-muted-foreground">Ashnight control room</p>
          <TwoFactorCard required available />
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Admin access unlocks as soon as your authenticator app is verified.
          </p>
        </div>
      </div>
    );
  }

  const displayName = profile?.display_name || "Admin";
  const activeLabel =
    [...NAV]
      .sort((a, b) => b.to.length - a.to.length)
      .find((item) => (item.exact ? pathname === item.to : pathname.startsWith(item.to)))?.label ??
    "Admin";

  return (
    <div data-admin-shell className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-[1400px]">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border/70 bg-panel px-4 py-6 lg:flex">
          <Link to="/" className="px-2 font-display text-lg font-semibold tracking-tight">
            Ashnight<span className="text-primary">.</span>
            <span className="ml-2 align-middle text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Admin
            </span>
          </Link>

          <nav className="mt-8 space-y-1">
            {NAV.map((item) => {
              const active = item.exact
                ? pathname === item.to
                : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                    active
                      ? "bg-secondary font-medium text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                  {item.to === "/ashnight-control/vetting" && pendingVetting ? (
                    <Badge className="ml-auto h-5 min-w-5 justify-center rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                      {pendingVetting}
                    </Badge>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-4">
            <a
              href="mailto:trust@ashnight.example"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <LifeBuoy className="size-4" /> Trust &amp; safety
            </a>
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2">
              <span className="text-xs text-muted-foreground">Appearance</span>
              <div className="flex items-center gap-1">
                <NotificationBell />
                <ThemeToggle className="size-8" />
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
              <Link to="/profile" aria-label="Your profile">
                <Avatar className="size-8 border border-border transition-colors hover:border-primary/50">
                  <AvatarFallback className="bg-surface-strong text-[11px]">
                    {initials(displayName)}
                  </AvatarFallback>
                </Avatar>
              </Link>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{displayName}</p>
                <Link
                  to="/profile"
                  className="truncate text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Administrator · view profile
                </Link>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                aria-label="Sign out"
                onClick={() => void handleSignOut()}
              >
                <LogOut className="size-4" />
              </Button>
            </div>

          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {/* mobile nav — drawer opens from the right for thumb reach */}
          <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-border/70 bg-panel/95 px-3 py-2.5 backdrop-blur lg:hidden">
            <Link to="/" className="min-w-0 font-display text-base font-semibold tracking-tight">
              Ashnight<span className="text-primary">.</span>
            </Link>
            <span className="truncate text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {activeLabel}
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <NotificationBell />
              <ThemeToggle className="size-8" />
              <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                <SheetTrigger asChild>
                  <Button size="icon" variant="outline" className="size-9" aria-label="Open admin menu">
                    <Menu className="size-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[17rem] p-0">
                  <SheetHeader className="border-b border-border/70 px-4 py-4 text-left">
                    <SheetTitle className="font-display text-base">Control room</SheetTitle>
                  </SheetHeader>
                  <nav className="max-h-[calc(100svh-8.5rem)] space-y-1 overflow-y-auto px-3 py-3">
                    {NAV.map((item) => {
                      const active = item.exact
                        ? pathname === item.to
                        : pathname.startsWith(item.to);
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={() => setMenuOpen(false)}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                            active
                              ? "bg-secondary font-medium text-foreground"
                              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                          )}
                        >
                          <item.icon className="size-4" />
                          {item.label}
                          {item.to === "/ashnight-control/vetting" && pendingVetting ? (
                            <Badge className="ml-auto h-5 min-w-5 justify-center rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                              {pendingVetting}
                            </Badge>
                          ) : null}
                        </Link>
                      );
                    })}
                  </nav>
                  <div className="flex items-center gap-3 border-t border-border/70 px-4 py-3">
                    <Link to="/profile" aria-label="Your profile" onClick={() => setMenuOpen(false)}>
                      <Avatar className="size-8 border border-border">
                        <AvatarFallback className="bg-surface-strong text-[11px]">
                          {initials(displayName)}
                        </AvatarFallback>
                      </Avatar>
                    </Link>
                    <p className="min-w-0 flex-1 truncate text-xs font-medium">{displayName}</p>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      aria-label="Sign out"
                      onClick={() => void handleSignOut()}
                    >
                      <LogOut className="size-4" />
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>

          <div className="px-5 py-8 sm:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
