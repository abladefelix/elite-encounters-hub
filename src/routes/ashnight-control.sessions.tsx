import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Loader2, LogOut, MonitorSmartphone, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminAccess } from "@/lib/admin-permissions";
import { useSettingsSection } from "@/lib/platform-settings";
import { forceEndSession, forceEndSessions, forceEndUserSessions, listAdminSessions } from "@/lib/session-management.functions";

const DEFAULT_POLICY = { maxConcurrentSessions: 1, idleTimeoutMinutes: 30, absoluteTimeoutHours: 24 };
type SessionFilter = "all" | "active" | "expired" | "revoked";

export const Route = createFileRoute("/ashnight-control/sessions")({
  head: () => ({ meta: [
    { title: "Session Management | Ashnight Admin" },
    { name: "description", content: "Control login duration, concurrent devices, and active Ashnight sessions." },
    { property: "og:title", content: "Session Management | Ashnight Admin" },
    { property: "og:description", content: "Control login duration, concurrent devices, and active sessions." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: SessionManagementPage,
});

function SessionManagementPage() {
  const access = useAdminAccess();
  const settings = useSettingsSection("security", DEFAULT_POLICY);
  const [policy, setPolicy] = useState(DEFAULT_POLICY);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SessionFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  if (settings.ready && !loaded) { setPolicy(settings.value); setLoaded(true); }
  const list = useServerFn(listAdminSessions);
  const endOne = useServerFn(forceEndSession);
  const endMany = useServerFn(forceEndSessions);
  const endUser = useServerFn(forceEndUserSessions);
  const queryClient = useQueryClient();
  const sessions = useQuery({ queryKey: ["admin-sessions"], queryFn: () => list(), refetchInterval: 30_000 });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-sessions"] });
  const revoke = useMutation({ mutationFn: (sessionId: string) => endOne({ data: { sessionId } }), onSuccess: async () => { toast.success("The selected session was ended."); await refresh(); }, onError: (error) => toast.error(error instanceof Error ? error.message : "Could not end that session.") });
  const revokeUser = useMutation({ mutationFn: (userId: string) => endUser({ data: { userId } }), onSuccess: async () => { toast.success("All sessions for that member were ended."); await refresh(); }, onError: (error) => toast.error(error instanceof Error ? error.message : "Could not end those sessions.") });
  const revokeMany = useMutation({ mutationFn: (sessionIds: string[]) => endMany({ data: { sessionIds } }), onSuccess: async (result) => { toast.success(`${result.count} selected ${result.count === 1 ? "session was" : "sessions were"} ended.`); setSelected(new Set()); setConfirmBulk(false); await refresh(); }, onError: (error) => toast.error(error instanceof Error ? error.message : "Could not end the selected sessions.") });
  const rows = useMemo(() => (sessions.data ?? []).filter((row) => {
    const now = new Date();
    const active = !row.revoked_at && new Date(row.idle_expires_at) > now && new Date(row.absolute_expires_at) > now;
    const revoked = Boolean(row.revoked_at);
    const expired = !revoked && !active;
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" && active) || (statusFilter === "revoked" && revoked) || (statusFilter === "expired" && expired);
    const matchesSearch = `${row.profile?.display_name ?? ""} ${row.profile?.username ?? ""} ${row.device_name} ${row.ip_address}`.toLowerCase().includes(query.toLowerCase());
    return matchesStatus && matchesSearch;
  }), [sessions.data, query, statusFilter]);
  const activeRows = rows.filter((row) => !row.revoked_at && new Date(row.idle_expires_at) > new Date() && new Date(row.absolute_expires_at) > new Date());
  const selectedActiveIds = activeRows.filter((row) => selected.has(row.id)).map((row) => row.id);
  const allActiveSelected = activeRows.length > 0 && activeRows.every((row) => selected.has(row.id));
  const toggleAll = (checked: boolean) => setSelected((current) => { const next = new Set(current); activeRows.forEach((row) => checked ? next.add(row.id) : next.delete(row.id)); return next; });
  const toggleRow = (id: string, checked: boolean) => setSelected((current) => { const next = new Set(current); checked ? next.add(id) : next.delete(id); return next; });
  const activeCount = (sessions.data ?? []).filter((row) => !row.revoked_at && new Date(row.idle_expires_at) > new Date() && new Date(row.absolute_expires_at) > new Date()).length;
  const revokedCount = (sessions.data ?? []).filter((row) => Boolean(row.revoked_at)).length;
  const expiredCount = Math.max(0, (sessions.data ?? []).length - activeCount - revokedCount);
  const openRegistry = (filter: SessionFilter) => {
    setStatusFilter(filter);
    requestAnimationFrame(() => document.getElementById("session-registry")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const openPolicy = () => requestAnimationFrame(() => document.getElementById("session-policy")?.scrollIntoView({ behavior: "smooth", block: "start" }));

  return <div className="space-y-7"><header><p className="eyebrow text-muted-foreground">Access control</p><h1 className="mt-1 font-display text-2xl font-semibold">Session management</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Control how long accounts stay signed in, prevent account sharing across devices, and terminate access immediately.</p></header>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Active now" hint="Open active sessions" value={activeCount} icon={ShieldCheck} onClick={() => openRegistry("active")} /><Metric label="Registered sessions" hint="Open full registry" value={(sessions.data ?? []).length} icon={MonitorSmartphone} onClick={() => openRegistry("all")} /><Metric label="Expired or revoked" hint="Review session history" value={expiredCount + revokedCount} icon={LogOut} onClick={() => openRegistry(expiredCount ? "expired" : "revoked")} /><Metric label="Concurrent limit" hint="Edit global policy" value={settings.value.maxConcurrentSessions} icon={Clock3} onClick={openPolicy} /></div>
    <Card id="session-policy" className="scroll-mt-6 p-5 sm:p-6"><h2 className="font-display text-lg font-semibold">Global session policy</h2><p className="mt-1 text-sm text-muted-foreground">Changes apply to every client, specialist and admin account. The default allows one active device.</p><div className="mt-5 grid gap-4 sm:grid-cols-3"><PolicyInput label="Concurrent devices" value={policy.maxConcurrentSessions} min={1} max={10} onChange={(value) => setPolicy((p) => ({ ...p, maxConcurrentSessions: value }))} /><PolicyInput label="Idle timeout (minutes)" value={policy.idleTimeoutMinutes} min={5} max={10080} onChange={(value) => setPolicy((p) => ({ ...p, idleTimeoutMinutes: value }))} /><PolicyInput label="Maximum login (hours)" value={policy.absoluteTimeoutHours} min={1} max={720} onChange={(value) => setPolicy((p) => ({ ...p, absoluteTimeoutHours: value }))} /></div><Button className="mt-5" disabled={!access.superAdmin || settings.loading} onClick={async () => { try { await settings.save(policy); toast.success("Session policy saved."); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save policy."); } }}>Save policy</Button>{!access.superAdmin && <p className="mt-2 text-xs text-muted-foreground">Only a super admin can change the global policy.</p>}</Card>
    <Card id="session-registry" className="scroll-mt-6 p-5 sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-display text-lg font-semibold">Session registry</h2><p className="mt-1 text-sm text-muted-foreground">Revoked and expired sessions remain visible for investigation.</p></div><div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto"><Button variant="outline" size="icon" aria-label="Refresh session registry" title="Refresh session registry" disabled={sessions.isFetching} onClick={() => refresh()}><RefreshCw className={`size-4 ${sessions.isFetching ? "animate-spin" : ""}`} /></Button><Button variant="destructive" disabled={!selectedActiveIds.length || access.readOnly || revokeMany.isPending} onClick={() => setConfirmBulk(true)}><LogOut className="size-4" /> End selected ({selectedActiveIds.length})</Button><div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search member, device or IP" className="pl-9" /></div></div></div><div className="mt-4 flex flex-wrap gap-2">{(["all", "active", "expired", "revoked"] as const).map((filter) => <Button key={filter} size="sm" variant={statusFilter === filter ? "default" : "outline"} onClick={() => { setStatusFilter(filter); setSelected(new Set()); }}>{filter === "all" ? `All (${(sessions.data ?? []).length})` : filter === "active" ? `Active (${activeCount})` : filter === "expired" ? `Expired (${expiredCount})` : `Revoked (${revokedCount})`}</Button>)}{selected.size > 0 && <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear selection</Button>}</div>{sessions.isLoading ? <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading sessions…</p> : rows.length === 0 ? <p className="mt-6 text-sm text-muted-foreground">No sessions match these controls.</p> : <div className="mt-5 overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="w-10"><Checkbox aria-label="Select all active sessions in these results" checked={allActiveSelected} onCheckedChange={(checked) => toggleAll(checked === true)} disabled={!activeRows.length || access.readOnly} /></TableHead><TableHead>Member</TableHead><TableHead>Device</TableHead><TableHead>Last active</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Control</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => { const active = !row.revoked_at && new Date(row.idle_expires_at) > new Date() && new Date(row.absolute_expires_at) > new Date(); return <TableRow key={row.id} data-state={selected.has(row.id) ? "selected" : undefined}><TableCell><Checkbox aria-label={`Select session for ${row.profile?.display_name ?? "member"}`} checked={selected.has(row.id)} onCheckedChange={(checked) => toggleRow(row.id, checked === true)} disabled={!active || access.readOnly} /></TableCell><TableCell><p className="font-medium">{row.profile?.display_name ?? "Unknown member"}</p><p className="text-xs text-muted-foreground">@{row.profile?.username ?? row.user_id.slice(0, 8)}</p></TableCell><TableCell><p>{row.device_name}</p><p className="max-w-56 truncate text-xs text-muted-foreground">{row.ip_address || "IP unavailable"}</p></TableCell><TableCell>{new Date(row.last_seen_at).toLocaleString()}</TableCell><TableCell><Badge variant={active ? "default" : "secondary"}>{active ? "Active" : row.revoked_reason || "Expired"}</Badge></TableCell><TableCell className="text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={!active || access.readOnly || revoke.isPending} onClick={() => revoke.mutate(row.id)}><LogOut className="size-3.5" /> End</Button><Button size="sm" variant="destructive" disabled={access.readOnly || revokeUser.isPending} onClick={() => revokeUser.mutate(row.user_id)}>End all</Button></div></TableCell></TableRow>; })}</TableBody></Table></div>}</Card>
    <AlertDialog open={confirmBulk} onOpenChange={setConfirmBulk}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>End selected sessions?</AlertDialogTitle><AlertDialogDescription>This will immediately sign out {selectedActiveIds.length} selected {selectedActiveIds.length === 1 ? "session" : "sessions"}. Other sessions belonging to those members will remain active.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={revokeMany.isPending}>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={revokeMany.isPending} onClick={(event) => { event.preventDefault(); revokeMany.mutate(selectedActiveIds); }}>{revokeMany.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <LogOut className="mr-2 size-4" />}End selected</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function Metric({ label, hint, value, icon: Icon, onClick }: { label: string; hint: string; value: number; icon: typeof ShieldCheck; onClick: () => void }) { return <Button variant="outline" className="h-auto justify-start gap-3 p-4 text-left" onClick={onClick}><span className="icon-box shrink-0"><Icon className="size-4" /></span><span className="min-w-0"><span className="block text-2xl font-semibold">{value}</span><span className="block text-xs text-muted-foreground">{label}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{hint}</span></span></Button>; }
function PolicyInput({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) { return <div className="space-y-2"><Label>{label}</Label><Input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value) || min)))} /></div>; }