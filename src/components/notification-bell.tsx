import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/lib/support";

/** Header bell: unread count straight from the live notifications table. */
export function NotificationBell() {
  const { user } = useAuth();
  const { data } = useNotifications(user?.id);
  const unread = (data ?? []).filter((row) => !row.read_at).length;

  if (!user) return null;

  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={unread ? `${unread} unread notifications` : "Notifications"}
    >
      <Link to="/support" search={{ tab: "inbox" }}>
        <Bell className="size-5" />
        {unread ? (
          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[0.55rem] font-semibold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
