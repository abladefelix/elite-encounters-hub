import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Clock, Users } from "lucide-react";
import { useState } from "react";

import { GroupBookingDialog } from "@/components/group-booking-dialog";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TierBadge } from "@/components/tier-badge";
import { useAuth } from "@/hooks/use-auth";
import { listBookableGroups } from "@/lib/group-bookings.functions";
import { money } from "@/lib/types";

type Group = Awaited<ReturnType<typeof listBookableGroups>>[number];

export const Route = createFileRoute("/groups")({
  head: () => ({ meta: [
    { title: "Book an Ash Group | Ashnight" },
    { name: "description", content: "Book an admin-curated Ash group of vetted cleaning specialists with one payment and protected member-by-member escrow." },
    { property: "og:title", content: "Book an Ash Group | Ashnight" },
    { property: "og:description", content: "Vetted Ash groups, one checkout, and protected member-by-member escrow." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: GroupsPage,
});

function GroupsPage() {
  const { user, isSpecialist, isAdmin } = useAuth();
  const listGroups = useServerFn(listBookableGroups);
  const groups = useQuery({ queryKey: ["bookable-groups", user?.id ?? "anon"], enabled: Boolean(user) && (!isSpecialist || isAdmin), queryFn: () => listGroups() });
  const [selected, setSelected] = useState<Group | null>(null);

  return <div className="min-h-screen pb-20 md:pb-0"><SiteHeader /><main className="mx-auto w-full max-w-6xl px-5 py-10">
    {!user ? <div className="mx-auto max-w-lg py-16 text-center"><Users className="mx-auto size-8 text-primary" /><h1 className="mt-4 font-display text-3xl font-semibold">Your Ash group is one sign-in away</h1><p className="mt-3 text-sm text-muted-foreground">Sign in to see vetted Ash groups available in your room and book them with protected escrow.</p><Button asChild className="mt-6"><Link to="/auth">Sign in to view Ash groups</Link></Button></div>
    : isSpecialist && !isAdmin ? <div className="mx-auto max-w-lg py-16 text-center"><h1 className="font-display text-3xl font-semibold">Your Ash group bookings come to you</h1><p className="mt-3 text-sm text-muted-foreground">Admins assign specialists to Ash groups. When a client books your group, the shared conversation and your personal escrow allocation appear automatically.</p><Button asChild className="mt-6"><Link to="/messages">Open messages</Link></Button></div>
    : <><header className="max-w-3xl"><p className="eyebrow text-primary">Collective care</p><h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">An Ash group for work that needs more hands</h1><p className="mt-3 text-muted-foreground">One booking coordinates the full crew. Each specialist&apos;s share is fixed before payment and protected separately in escrow.</p></header>
      {groups.isError && <div className="mt-8 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Ash groups could not be loaded. Please refresh and try again.</div>}
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(groups.data ?? []).map((group) => { const lead = group.specialist_group_members.find((member) => member.is_lead); const profile = lead?.profiles; return <Card key={group.id} className="flex flex-col"><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{group.name}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Led by {profile?.display_name ?? "Ashnight team lead"}</p></div><TierBadge tier={group.room} /></div></CardHeader><CardContent className="flex flex-1 flex-col"><p className="line-clamp-3 text-sm text-muted-foreground">{group.description}</p><div className="mt-5 grid grid-cols-2 gap-3 border-t pt-4 text-sm"><span className="flex items-center gap-1.5"><Users className="size-4 text-primary" /> {group.specialist_group_members.length} specialists</span><span className="flex items-center gap-1.5"><Clock className="size-4 text-primary" /> {group.pricing_model === "hourly" ? "Hourly" : "Flat rate"}</span></div><div className="mt-4 flex items-center justify-between"><div><p className="text-xs text-muted-foreground">From</p><p className="font-display font-semibold">{money(group.base_rate)}{group.pricing_model === "hourly" ? "/h" : ""}</p></div><Button onClick={() => setSelected(group)} disabled={group.specialist_group_services.length === 0}>View &amp; book</Button></div></CardContent></Card>; })}</div>
      {!groups.isLoading && (groups.data?.length ?? 0) === 0 && <div className="mt-10 rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">No Ash groups are open to your room right now.</div>}
    </>}
  </main><SiteFooter />
  <GroupBookingDialog group={selected} onClose={() => setSelected(null)} />
  </div>;
}