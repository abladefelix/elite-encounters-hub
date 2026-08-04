import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Clock, ShieldCheck, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TierBadge } from "@/components/tier-badge";
import { useAuth } from "@/hooks/use-auth";
import { listBookableGroups } from "@/lib/group-bookings.functions";
import { startGroupBookingCheckout } from "@/lib/payments.functions";
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
  const checkout = useServerFn(startGroupBookingCheckout);
  const groups = useQuery({ queryKey: ["bookable-groups", user?.id ?? "anon"], enabled: Boolean(user) && (!isSpecialist || isAdmin), queryFn: () => listGroups() });
  const [selected, setSelected] = useState<Group | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [hours, setHours] = useState(2);
  const [scheduledFor, setScheduledFor] = useState("");
  const [notes, setNotes] = useState("");
  const service = useMemo(() => selected?.specialist_group_services.find((item) => item.service_id === serviceId), [selected, serviceId]);
  const pay = useMutation({
    mutationFn: () => {
      if (!selected || !serviceId) throw new Error("Choose a group service first.");
      return checkout({ data: { groupId: selected.id, serviceId, hours, scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null, notes, addons: [], callbackUrl: `${window.location.origin}/payment/return` } });
    },
    onSuccess: (result) => { window.location.href = result.authorizationUrl; },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Checkout could not be started."),
  });
  const open = (group: Group) => { setSelected(group); setServiceId(group.specialist_group_services[0]?.service_id ?? ""); setHours(group.specialist_group_services[0]?.minimum_hours ?? 2); setScheduledFor(""); setNotes(""); };

  return <div className="min-h-screen pb-20 md:pb-0"><SiteHeader /><main className="mx-auto w-full max-w-6xl px-5 py-10">
    {!user ? <div className="mx-auto max-w-lg py-16 text-center"><Users className="mx-auto size-8 text-primary" /><h1 className="mt-4 font-display text-3xl font-semibold">Your Ash group is one sign-in away</h1><p className="mt-3 text-sm text-muted-foreground">Sign in to see vetted Ash groups available in your room and book them with protected escrow.</p><Button asChild className="mt-6"><Link to="/auth">Sign in to view Ash groups</Link></Button></div>
    : isSpecialist && !isAdmin ? <div className="mx-auto max-w-lg py-16 text-center"><h1 className="font-display text-3xl font-semibold">Your Ash group bookings come to you</h1><p className="mt-3 text-sm text-muted-foreground">Admins assign specialists to Ash groups. When a client books your group, the shared conversation and your personal escrow allocation appear automatically.</p><Button asChild className="mt-6"><Link to="/messages">Open messages</Link></Button></div>
    : <><header className="max-w-3xl"><p className="eyebrow text-primary">Collective care</p><h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">An Ash group for work that needs more hands</h1><p className="mt-3 text-muted-foreground">One booking coordinates the full crew. Each specialist&apos;s share is fixed before payment and protected separately in escrow.</p></header>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(groups.data ?? []).map((group) => { const lead = group.specialist_group_members.find((member) => member.is_lead); const profile = lead?.profiles; return <Card key={group.id} className="flex flex-col"><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{group.name}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Led by {profile?.display_name ?? "Ashnight team lead"}</p></div><TierBadge tier={group.room} /></div></CardHeader><CardContent className="flex flex-1 flex-col"><p className="line-clamp-3 text-sm text-muted-foreground">{group.description}</p><div className="mt-5 grid grid-cols-2 gap-3 border-t pt-4 text-sm"><span className="flex items-center gap-1.5"><Users className="size-4 text-primary" /> {group.specialist_group_members.length} specialists</span><span className="flex items-center gap-1.5"><Clock className="size-4 text-primary" /> {group.pricing_model === "hourly" ? "Hourly" : "Flat rate"}</span></div><div className="mt-4 flex items-center justify-between"><div><p className="text-xs text-muted-foreground">From</p><p className="font-display font-semibold">{money(group.base_rate)}{group.pricing_model === "hourly" ? "/h" : ""}</p></div><Button onClick={() => open(group)}>View &amp; book</Button></div></CardContent></Card>; })}</div>
      {!groups.isLoading && (groups.data?.length ?? 0) === 0 && <div className="mt-10 rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">No Ash groups are open to your room right now.</div>}
    </>}
  </main><SiteFooter />
  <Dialog open={Boolean(selected)} onOpenChange={(openState) => !openState && setSelected(null)}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{selected?.name}</DialogTitle><DialogDescription>{selected?.description}</DialogDescription></DialogHeader>{selected && <div className="space-y-4"><div className="flex flex-wrap gap-2">{selected.specialist_group_members.map((member) => <Badge key={member.id} variant="secondary">{member.profiles?.display_name ?? "Specialist"}{member.is_lead ? " · Lead" : ""}</Badge>)}</div><div className="space-y-2"><Label>Service</Label><Select value={serviceId} onValueChange={(value) => { setServiceId(value); const match = selected.specialist_group_services.find((item) => item.service_id === value); if (match) setHours(match.minimum_hours); }}><SelectTrigger><SelectValue placeholder="Choose a service" /></SelectTrigger><SelectContent>{selected.specialist_group_services.map((item) => <SelectItem key={item.id} value={item.service_id}>{item.services?.name ?? "Group service"} · {money(item.rate)}/h</SelectItem>)}</SelectContent></Select></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="group-hours">Hours</Label><Input id="group-hours" type="number" min={service?.minimum_hours ?? 1} max={48} step="0.5" value={hours} onChange={(event) => setHours(Number(event.target.value))} /></div><div className="space-y-2"><Label htmlFor="group-time">Preferred time</Label><Input id="group-time" type="datetime-local" min={new Date().toISOString().slice(0, 16)} value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} /></div></div><div className="space-y-2"><Label htmlFor="group-notes">Visit notes</Label><Textarea id="group-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Access, priorities, or special instructions" /></div><div className="flex items-start gap-2 rounded-md border p-3 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /><p>Your single payment is divided into separately auditable escrow allocations for every specialist.</p></div></div>}<DialogFooter><Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button><Button disabled={pay.isPending || !serviceId || hours < (service?.minimum_hours ?? 1)} onClick={() => pay.mutate()}>{pay.isPending ? "Opening secure checkout…" : "Continue to payment"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}