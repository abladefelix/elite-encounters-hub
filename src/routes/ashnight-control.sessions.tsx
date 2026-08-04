import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Loader2, LogOut, MonitorSmartphone, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminAccess } from "@/lib/admin-permissions";
import { useSettingsSection } from "@/lib/platform-settings";
import { forceEndSession, forceEndUserSessions, listAdminSessions } from "@/lib/session-management.functions";

const DEFAULT_POLICY = { maxConcurrentSessions: 1, idleTimeoutMinutes: 30, absoluteTimeoutHours: 24 };

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
  if (settings.ready && !loaded) { setPolicy(settings.value); setLoaded(true); }
  const list = useServerFn(listAdminSessions);
  const endOne = useServerFn(forceEndSession);
  const endUser = useServerFn(forceEndUserSessions);
  const queryClient = useQueryClient();
  const sessions = useQuery({ queryKey: ["admin-sessions"], queryFn: () => list(), refetchInterval: 30_000 });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-sessions"] });
  const revoke = useMutation({ mutationFn: (sessionId: string) => endOne({ data: { sessionId } }), onSuccess: async () => { toast.success("The account was signed out on all devices."); await refresh(); }, onError: (error) => toast.error(error instanceof Error ? error.message : "Could not end that session.") });
  const revokeUser = useMutation({ mutationFn: (userId: string) => endUser({ data: { userId } }), onSuccess: async () => { toast.success("All sessions for that member were ended."); await refresh(); }, onError: (error) => toast.error(error instanceof Error ? error.message : "Could not end those sessions.") });
  const rows = useMemo(() => (sessions.data ?? []).filter((row) => `${row.profile?.display_name ?? ""} ${row.profile?.username ?? ""} ${row.device_name} ${row.ip_address}`.toLowerCase().includes(query.toLowerCase())), [sessions.data, query]);
  const activeCount = (sessions.data ?? []).filter((row) => !row.revoked_at && new Date(row.idle_expires_at) > new Date() && new Date(row.absolute_expires_at) > new Date()).length;

  return <div className="space-y-7"><header><p className="eyebrow text-muted-foreground">Access control</p><h1 className="mt-1 font-display text-2xl font-semibold">Session management</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Control how long accounts stay signed in, prevent account sharing across devices, and terminate access immediately.</p></header>
    <div className="grid gap-4 sm:grid-cols-3"><Metric label="Active now" value={activeCount} icon={ShieldCheck} /><Metric label="Registered sessions" value={(sessions.data ?? []).length} icon={MonitorSmartphone} /><Metric label="Concurrent limit" value={settings.value.maxConcurrentSessions} icon={Clock3} /></div>
    <Card className="p-5 sm:p-6"><h2 className="font-display text-lg font-semibold">Global session policy</h2><p className="mt-1 text-sm text-muted-foreground">Changes apply to every client, specialist and admin account. The default allows one active device.</p><div className="mt-5 grid gap-4 sm:grid-cols-3"><PolicyInput label="Concurrent devices" value={policy.maxConcurrentSessions} min={1} max={10} onChange={(value) => setPolicy((p) => ({ ...p, maxConcurrentSessions: value }))} /><PolicyInput label="Idle timeout (minutes)" value={policy.idleTimeoutMinutes} min={5} max={10080} onChange={(value) => setPolicy((p) => ({ ...p, idleTimeoutMinutes: value }))} /><PolicyInput label="Maximum login (hours)" value={policy.absoluteTimeoutHours} min={1} max={720} onChange={(value) => setPolicy((p) => ({ ...p, absoluteTimeoutHours: value }))} /></div><Button className="mt-5" disabled={!access.superAdmin || settings.loading} onClick={async () => { try { await settings.save(policy); toast.success("Session policy saved."); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save policy."); } }}>Save policy</Button>{!access.superAdmin && <p className="mt-2 text-xs text-muted-foreground">Only a super admin can change the global policy.</p>}</Card>
    <Card className="p-5 sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-display text-lg font-semibold">Session registry</h2><p className="mt-1 text-sm text-muted-foreground">Revoked and expired sessions remain visible for investigation.</p></div><div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search member, device or IP" className="pl-9" /></div></div>{sessions.isLoading ? <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading sessions…</p> : <div className="mt-5"><Table><TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Device</TableHead><TableHead>Last active</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Control</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => { const active = !row.revoked_at && new Date(row.idle_expires_at) > new Date() && new Date(row.absolute_expires_at) > new Date(); return <TableRow key={row.id}><TableCell><p className="font-medium">{row.profile?.display_name ?? "Unknown member"}</p><p className="text-xs text-muted-foreground">@{row.profile?.username ?? row.user_id.slice(0, 8)}</p></TableCell><TableCell><p>{row.device_name}</p><p className="max-w-56 truncate text-xs text-muted-foreground">{row.ip_address || "IP unavailable"}</p></TableCell><TableCell>{new Date(row.last_seen_at).toLocaleString()}</TableCell><TableCell><Badge variant={active ? "default" : "secondary"}>{active ? "Active" : row.revoked_reason || "Expired"}</Badge></TableCell><TableCell className="text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={!active || access.readOnly || revoke.isPending} onClick={() => revoke.mutate(row.id)}><LogOut className="size-3.5" /> End</Button><Button size="sm" variant="destructive" disabled={access.readOnly || revokeUser.isPending} onClick={() => revokeUser.mutate(row.user_id)}>End all</Button></div></TableCell></TableRow>; })}</TableBody></Table></div>}</Card>
  </div>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof ShieldCheck }) { return <Card className="flex items-center gap-3 p-4"><span className="icon-box"><Icon className="size-4" /></span><div><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></Card>; }
function PolicyInput({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) { return <div className="space-y-2"><Label>{label}</Label><Input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value) || min)))} /></div>; }