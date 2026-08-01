import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  BadgeCheck,
  CalendarCheck,
  DoorOpen,
  ShieldCheck,
  ShieldBan,
  LayoutDashboard,
  LifeBuoy,
  Users,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { adminMetrics } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/ashnight-control")({
  component: AdminLayout,
});

const NAV: { to: string; label: string; icon: typeof Users; exact?: boolean }[] = [
  { to: "/ashnight-control", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/ashnight-control/vetting", label: "Vetting queue", icon: BadgeCheck },
  { to: "/ashnight-control/users", label: "Users", icon: Users },
  { to: "/ashnight-control/rooms", label: "Rooms", icon: DoorOpen },
  { to: "/ashnight-control/bookings", label: "Bookings", icon: CalendarCheck },
  { to: "/ashnight-control/escrow", label: "Escrow & gifts", icon: ShieldCheck },
  { to: "/ashnight-control/moderation", label: "Moderation", icon: ShieldBan },
];

function AdminLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const metrics = adminMetrics();

  return (
    <div className="min-h-screen bg-background">
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
                  {item.to === "/ashnight-control/vetting" && metrics.pendingVetting ? (
                    <Badge className="ml-auto h-5 min-w-5 justify-center rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                      {metrics.pendingVetting}
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
              <ThemeToggle className="size-8" />
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
              <Avatar className="size-8 border border-border">
                <AvatarFallback className="bg-surface-strong text-[11px]">AD</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">Ada Duru</p>
                <p className="truncate text-[10px] text-muted-foreground">Head of vetting</p>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {/* mobile nav */}
          <div className="sticky top-0 z-20 flex gap-1 overflow-x-auto border-b border-border/70 bg-panel/95 px-3 py-2.5 backdrop-blur lg:hidden">
            {NAV.map((item) => {
              const active = item.exact
                ? pathname === item.to
                : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "shrink-0 rounded-full px-3.5 py-1.5 text-xs transition-colors",
                    active
                      ? "bg-secondary font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            <div className="ml-auto shrink-0 pl-2">
              <ThemeToggle className="size-8" />
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
