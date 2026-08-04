import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pencil, Plus, Search, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { TierBadge } from "@/components/tier-badge";
import { useAdminAccess } from "@/lib/admin-permissions";
import { changeSpecialistGroupStatus, listAdminGroups, saveSpecialistGroup } from "@/lib/specialist-groups.functions";
import { useAllProfiles, useServices, type Tier } from "@/lib/queries";
import { money } from "@/lib/types";

type AdminGroup = Awaited<ReturnType<typeof listAdminGroups>>[number];
type MemberDraft = { specialistId: string; roleLabel: string; isLead: boolean; sharePct: number };
type ServiceDraft = { serviceId: string; rate: number; minimumHours: number };
type Draft = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  room: Tier;
  pricingModel: "flat" | "hourly";
  baseRate: number;
  capacity: number;
  available: boolean;
  active: boolean;
  members: MemberDraft[];
  services: ServiceDraft[];
};

const emptyDraft = (): Draft => ({ name: "", slug: "", description: "", room: "basic", pricingModel: "hourly", baseRate: 10000, capacity: 2, available: true, active: false, members: [], services: [] });

export const Route = createFileRoute("/ashnight-control/groups")({
  head: () => ({ meta: [
    { title: "Ash Groups | Ashnight Admin" },
    { name: "description", content: "Manage Ash groups, services, booking access and escrow payout allocations." },
    { property: "og:title", content: "Ash Groups | Ashnight Admin" },
    { property: "og:description", content: "Manage Ash groups, services, booking access and escrow payout allocations." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: AdminGroups,
});

function AdminGroups() {
  const access = useAdminAccess();
  const canWrite = access.superAdmin || !access.readOnly;
  const queryClient = useQueryClient();
  const listGroups = useServerFn(listAdminGroups);
  const saveGroup = useServerFn(saveSpecialistGroup);
  const changeStatus = useServerFn(changeSpecialistGroupStatus);
  const groups = useQuery({ queryKey: ["admin", "specialist-groups"], queryFn: () => listGroups() });
  const profiles = useAllProfiles();
  const services = useServices(true);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const specialists = useMemo(() => (profiles.data ?? []).filter((profile) => profile.roles?.includes("specialist") && profile.vetting === "approved" && profile.account_status === "active" && !profile.suspended), [profiles.data]);
  const rows = useMemo(() => (groups.data ?? []).filter((group) => {
    const lead = group.specialist_group_members.find((member) => member.is_lead)?.profiles?.display_name ?? "";
    return `${group.name} ${lead}`.toLowerCase().includes(query.trim().toLowerCase());
  }), [groups.data, query]);
  const save = useMutation({ mutationFn: (value: Draft) => saveGroup({ data: value }), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin", "specialist-groups"] }); setDraft(null); toast.success("Ash group saved."); }, onError: (error) => toast.error(error instanceof Error ? error.message : "The Ash group could not be saved.") });
  const status = useMutation({ mutationFn: (input: { id: string; status: "draft" | "active" | "paused" }) => changeStatus({ data: input }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "specialist-groups"] }), onError: (error) => toast.error(error instanceof Error ? error.message : "Status could not be changed.") });
  const editGroup = (group: AdminGroup) => setDraft({ id: group.id, name: group.name, slug: group.slug, description: group.description, room: group.room, pricingModel: group.pricing_model === "flat" ? "flat" : "hourly", baseRate: group.base_rate, capacity: group.capacity, available: group.available, active: group.active, members: group.specialist_group_members.map((member) => ({ specialistId: member.specialist_id, roleLabel: member.role_label, isLead: member.is_lead, sharePct: member.share_pct })), services: group.specialist_group_services.map((service) => ({ serviceId: service.service_id, rate: service.rate, minimumHours: service.minimum_hours })) });

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-primary">Operations</p><h1 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Ash groups</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Build vetted crews, set client access, and freeze each member&apos;s escrow allocation when booked.</p></div><Button disabled={!canWrite} onClick={() => setDraft(emptyDraft())}><Plus className="size-4" /> Create Ash group</Button></header>
    <div className="relative max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search group or lead" className="pl-9" /></div>
    <Card className="overflow-hidden"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Group</TableHead><TableHead>Lead</TableHead><TableHead>Roster</TableHead><TableHead>Room</TableHead><TableHead>From</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>
      {rows.map((group) => { const lead = group.specialist_group_members.find((member) => member.is_lead)?.profiles?.display_name ?? "Not assigned"; const currentStatus = !group.active ? "draft" : group.available ? "active" : "paused"; return <TableRow key={group.id}><TableCell><p className="font-medium">{group.name}</p><p className="text-xs text-muted-foreground">{group.specialist_group_services.length} services</p></TableCell><TableCell>{lead}</TableCell><TableCell><span className="inline-flex items-center gap-1.5"><Users className="size-4 text-muted-foreground" />{group.specialist_group_members.length}</span></TableCell><TableCell><TierBadge tier={group.room} /></TableCell><TableCell>{money(group.base_rate)}{group.pricing_model === "hourly" ? "/h" : ""}</TableCell><TableCell><Badge variant={currentStatus === "active" ? "success" : "secondary"}>{currentStatus === "active" ? "Active" : currentStatus === "paused" ? "Paused" : "Draft"}</Badge></TableCell><TableCell className="text-right"><div className="inline-flex items-center gap-1"><Button variant="ghost" size="icon" aria-label={`Edit ${group.name}`} disabled={!canWrite} onClick={() => editGroup(group)}><Pencil className="size-4" /></Button><Select value={currentStatus} disabled={!canWrite || status.isPending} onValueChange={(value) => status.mutate({ id: group.id, status: value as "draft" | "active" | "paused" })}><SelectTrigger className="h-9 w-28" aria-label={`Change ${group.name} status`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="paused">Paused</SelectItem><SelectItem value="draft">Draft</SelectItem></SelectContent></Select></div></TableCell></TableRow>; })}
      {!groups.isLoading && rows.length === 0 && <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">No Ash groups match this view.</TableCell></TableRow>}
    </TableBody></Table></div></Card>
    <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-lg">Booking control</CardTitle><CardDescription>Room access is assigned by admin, never inherited from the lead.</CardDescription></CardHeader><CardContent className="flex gap-3 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" /><p>Clients see active, available groups permitted by their paid room. A single checkout creates a shared booking and conversation.</p></CardContent></Card><Card><CardHeader><CardTitle className="text-lg">Escrow allocation</CardTitle><CardDescription>Every member&apos;s percentage is explicit and must total 100%.</CardDescription></CardHeader><CardContent className="flex gap-3 text-sm text-muted-foreground"><Users className="mt-0.5 size-5 shrink-0 text-primary" /><p>Payment produces one traceable escrow leg per specialist. Releases, disputes, refunds and ledger entries remain independently auditable.</p></CardContent></Card></div>
    <GroupEditor draft={draft} setDraft={setDraft} specialists={specialists} services={services.data ?? []} saving={save.isPending} onSave={() => draft && save.mutate(draft)} />
  </div>;
}

function GroupEditor({ draft, setDraft, specialists, services, saving, onSave }: { draft: Draft | null; setDraft: (value: Draft | null) => void; specialists: Array<{ id: string; display_name: string }>; services: Array<{ id: string; name: string; active: boolean; base_rate: number }>; saving: boolean; onSave: () => void }) {
  if (!draft) return null;
  const patch = (value: Partial<Draft>) => setDraft({ ...draft, ...value });
  const total = draft.members.reduce((sum, member) => sum + member.sharePct, 0);
  const equalize = () => { if (!draft.members.length) return; const base = Math.floor(10000 / draft.members.length) / 100; patch({ members: draft.members.map((member, index) => ({ ...member, sharePct: index === draft.members.length - 1 ? Number((100 - base * (draft.members.length - 1)).toFixed(2)) : base })) }); };
  return <Dialog open onOpenChange={(open) => !open && setDraft(null)}><DialogContent className="max-h-[90dvh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>{draft.id ? "Edit Ash group" : "Create Ash group"}</DialogTitle><DialogDescription>Define the roster, client-facing services and the exact escrow split.</DialogDescription></DialogHeader><div className="grid gap-5 md:grid-cols-2">
    <div className="space-y-4"><div className="space-y-2"><Label htmlFor="group-name">Name</Label><Input id="group-name" value={draft.name} onChange={(event) => patch({ name: event.target.value, ...(!draft.id ? { slug: event.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") } : {}) })} /></div><div className="space-y-2"><Label htmlFor="group-slug">URL name</Label><Input id="group-slug" value={draft.slug} onChange={(event) => patch({ slug: event.target.value.toLowerCase() })} /></div><div className="space-y-2"><Label htmlFor="group-description">Description</Label><Textarea id="group-description" value={draft.description} onChange={(event) => patch({ description: event.target.value })} /></div>
      <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Room</Label><Select value={draft.room} onValueChange={(value) => patch({ room: value as Tier })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["basic", "premium", "ultimate", "room4", "room5", "room6", "room7", "room8"].map((room) => <SelectItem key={room} value={room}>{room}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Pricing</Label><Select value={draft.pricingModel} onValueChange={(value) => patch({ pricingModel: value as "flat" | "hourly" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="hourly">Hourly</SelectItem><SelectItem value="flat">Flat</SelectItem></SelectContent></Select></div></div>
      <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="base-rate">Base rate (pesewas)</Label><Input id="base-rate" type="number" min={1} value={draft.baseRate} onChange={(event) => patch({ baseRate: Number(event.target.value) })} /></div><div className="space-y-2"><Label htmlFor="capacity">Capacity</Label><Input id="capacity" type="number" min={1} value={draft.capacity} onChange={(event) => patch({ capacity: Number(event.target.value) })} /></div></div>
      <div className="flex items-center justify-between rounded-md border p-3"><div><p className="text-sm font-medium">Available for new work</p><p className="text-xs text-muted-foreground">Lead can still coordinate current bookings.</p></div><Switch checked={draft.available} onCheckedChange={(available) => patch({ available })} /></div><div className="flex items-center justify-between rounded-md border p-3"><div><p className="text-sm font-medium">Publish group</p><p className="text-xs text-muted-foreground">Drafts stay hidden from clients.</p></div><Switch checked={draft.active} onCheckedChange={(active) => patch({ active })} /></div>
    </div>
    <div className="space-y-5"><section className="space-y-3"><div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold">Roster &amp; payouts</h3><p className={`text-xs ${Math.abs(total - 100) < 0.001 ? "text-muted-foreground" : "text-destructive"}`}>{total.toFixed(2)}% allocated</p></div><Button variant="outline" size="sm" onClick={equalize}>Split equally</Button></div><div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-2">
      {specialists.map((specialist) => { const member = draft.members.find((item) => item.specialistId === specialist.id); return <div key={specialist.id} className="grid grid-cols-[auto_1fr_72px] items-center gap-2 rounded-md p-2 hover:bg-muted/50"><Checkbox checked={Boolean(member)} onCheckedChange={(checked) => patch({ members: checked ? [...draft.members, { specialistId: specialist.id, roleLabel: "Team specialist", isLead: draft.members.length === 0, sharePct: 0 }] : draft.members.filter((item) => item.specialistId !== specialist.id) })} /><div className="min-w-0"><p className="truncate text-sm font-medium">{specialist.display_name}</p>{member && <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => patch({ members: draft.members.map((item) => ({ ...item, isLead: item.specialistId === specialist.id })) })}>{member.isLead ? "Group lead" : "Make lead"}</Button>}</div>{member && <Input aria-label={`${specialist.display_name} payout percentage`} type="number" min={0.01} max={100} step="0.01" value={member.sharePct} onChange={(event) => patch({ members: draft.members.map((item) => item.specialistId === specialist.id ? { ...item, sharePct: Number(event.target.value) } : item) })} />}</div>; })}
    </div></section><section className="space-y-3"><div><h3 className="text-sm font-semibold">Bookable services</h3><p className="text-xs text-muted-foreground">Each selected service can override the group base rate.</p></div><div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-2">{services.filter((service) => service.active).map((service) => { const selected = draft.services.find((item) => item.serviceId === service.id); return <div key={service.id} className="grid grid-cols-[auto_1fr_100px] items-center gap-2 rounded-md p-2 hover:bg-muted/50"><Checkbox checked={Boolean(selected)} onCheckedChange={(checked) => patch({ services: checked ? [...draft.services, { serviceId: service.id, rate: service.base_rate, minimumHours: 1 }] : draft.services.filter((item) => item.serviceId !== service.id) })} /><span className="truncate text-sm">{service.name}</span>{selected && <Input aria-label={`${service.name} rate in pesewas`} type="number" min={1} value={selected.rate} onChange={(event) => patch({ services: draft.services.map((item) => item.serviceId === service.id ? { ...item, rate: Number(event.target.value) } : item) })} />}</div>; })}</div></section></div>
  </div><DialogFooter><Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button><Button disabled={saving || !draft.name || !draft.slug || !draft.members.length || !draft.services.length || Math.abs(total - 100) >= 0.001} onClick={onSave}>{saving ? "Saving…" : "Save group"}</Button></DialogFooter></DialogContent></Dialog>;
}