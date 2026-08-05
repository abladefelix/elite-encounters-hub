import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { ShieldCheck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { listBookableGroups } from "@/lib/group-bookings.functions";
import { requestGroupBooking } from "@/lib/group-bookings.functions";
import { useStoredMedia } from "@/lib/queries";
import { initials, money } from "@/lib/types";

export type BookableGroup = Awaited<ReturnType<typeof listBookableGroups>>[number];

export function GroupBookingDialog({ group, onClose }: { group: BookableGroup | null; onClose: () => void }) {
  const requestBooking = useServerFn(requestGroupBooking);
  const [serviceId, setServiceId] = useState("");
  const [hours, setHours] = useState(2);
  const [scheduledFor, setScheduledFor] = useState("");
  const [notes, setNotes] = useState("");
  const avatarItems = useMemo(() => group?.specialist_group_members.flatMap((member) => member.profiles?.avatar_url ? [{ bucket: "avatars" as const, value: member.profiles.avatar_url }] : []) ?? [], [group]);
  const { data: memberMedia } = useStoredMedia(avatarItems);
  const activeServiceId = serviceId || group?.specialist_group_services[0]?.service_id || "";
  const service = useMemo(() => group?.specialist_group_services.find((item) => item.service_id === activeServiceId), [group, activeServiceId]);
  const minimumHours = service?.minimum_hours ?? 1;
  const validHours = Number.isFinite(hours) && hours >= minimumHours && hours <= 48;
  useEffect(() => {
    if (!group) return;
    const firstService = group.specialist_group_services[0];
    setServiceId(firstService?.service_id ?? "");
    setHours(firstService?.minimum_hours ?? 1);
    setScheduledFor("");
    setNotes("");
  }, [group]);
  const request = useMutation({ mutationFn: () => {
    if (!group || !activeServiceId) throw new Error("Choose an Ash group service first.");
    if (!validHours) throw new Error(`Choose between ${minimumHours} and 48 hours for this service.`);
    return requestBooking({ data: { groupId: group.id, serviceId: activeServiceId, hours, scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null, notes, addons: [] } });
  }, onSuccess: (result) => { toast.success("Request sent to the Ash group"); window.location.href = `/messages?thread=${encodeURIComponent(result.thread_id)}`; }, onError: (error) => toast.error(error instanceof Error ? error.message : "The Ash group request could not be sent.") });
  const close = () => { setServiceId(""); setHours(2); setScheduledFor(""); setNotes(""); onClose(); };

  return <Dialog open={Boolean(group)} onOpenChange={(open) => !open && close()}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><div className="flex items-center gap-2"><Badge variant="secondary"><Users className="mr-1 size-3" /> Ash group</Badge></div><DialogTitle>{group?.name}</DialogTitle><DialogDescription>{group?.description}</DialogDescription></DialogHeader>{group && <div className="space-y-5"><section><p className="text-xs font-semibold uppercase text-muted-foreground">Proposed crew</p><div className="mt-2 flex flex-wrap gap-2">{group.specialist_group_members.map((member) => { const name = member.profiles?.display_name ?? "Specialist"; const storedAvatar = member.profiles?.avatar_url; const avatarUrl = storedAvatar ? memberMedia?.[storedAvatar] : undefined; return <Badge key={member.id} variant="outline" className="h-auto gap-2 py-1 pr-3 pl-1"><Avatar className="size-7 border border-border"><AvatarImage src={avatarUrl} alt={name} /><AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback></Avatar><span>{name}{member.is_lead ? " · Lead contact" : ` · ${member.role_label}`}</span></Badge>; })}</div><p className="mt-2 text-xs text-muted-foreground">Each specialist confirms availability in the shared chat before payment is enabled.</p></section><div className="space-y-2"><Label>Service</Label><Select value={activeServiceId} onValueChange={(value) => { setServiceId(value); const match = group.specialist_group_services.find((item) => item.service_id === value); if (match) setHours(match.minimum_hours); }}><SelectTrigger><SelectValue placeholder="Choose a service" /></SelectTrigger><SelectContent>{group.specialist_group_services.map((item) => <SelectItem key={item.id} value={item.service_id}>{item.services?.name ?? "Ash group service"} · {money(item.rate)}/h</SelectItem>)}</SelectContent></Select></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="team-hours">Hours</Label><Input id="team-hours" type="number" min={minimumHours} max={48} step="0.5" value={hours} onChange={(event) => setHours(event.target.value === "" ? 0 : Number(event.target.value))} /><p className="text-xs text-muted-foreground">Minimum {minimumHours} hour{minimumHours === 1 ? "" : "s"}</p></div><div className="space-y-2"><Label htmlFor="team-time">Preferred time</Label><Input id="team-time" type="datetime-local" min={new Date().toISOString().slice(0, 16)} value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} /></div></div><div className="space-y-2"><Label htmlFor="team-notes">Service instructions</Label><Textarea id="team-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Access, priorities, and instructions for the whole crew" /></div><div className="flex items-start gap-2 rounded-md border p-3 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /><p>No payment is taken now. The roster is checked first; after everyone confirms, the agreed total is locked and Paystack becomes available in chat.</p></div></div>}<DialogFooter><Button variant="outline" onClick={close}>Cancel</Button><Button disabled={request.isPending || !activeServiceId || !validHours} onClick={() => request.mutate()} title={!validHours ? `This service requires at least ${minimumHours} hours` : undefined}>{request.isPending ? "Creating shared chat…" : "Request this Ash group"}</Button></DialogFooter></DialogContent></Dialog>;
}