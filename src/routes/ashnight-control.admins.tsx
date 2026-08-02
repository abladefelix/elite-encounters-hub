import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck, ShieldX, UserCog, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { ExportMenu } from "@/components/admin/export-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  ACCOUNT_STATUSES,
  ACCOUNT_STATUS_META,
  statusBadgeClass,
  type AccountStatus,
} from "@/lib/account-status";
import { getUserAccount, updateUserAccount } from "@/lib/admin-users.functions";
import {
  ADMIN_AREAS,
  useAdminAccess,
  useAdminPermissionMutations,
  useAdminRoster,
  type AdminRosterEntry,
} from "@/lib/admin-permissions";
import { useAllProfiles } from "@/lib/queries";
import { useAuth } from "@/hooks/use-auth";
import { initials } from "@/lib/types";

type AppRole = "client" | "specialist" | "admin";
const ROLE_OPTIONS: { key: AppRole; label: string; blurb: string }[] = [
  { key: "admin", label: "Administrator", blurb: "Can open the control room." },
  { key: "specialist", label: "Specialist", blurb: "Appears in the specialist directory." },
  { key: "client", label: "Client", blurb: "Can book and pay for services." },
];


export const Route = createFileRoute("/ashnight-control/admins")({
  head: () => ({
    meta: [
      { title: "Admin roles & permissions | Ashnight Admin" },
      {
        name: "description",
        content:
          "Super-admin control over what each Ashnight administrator can open, change and export in the control room.",
      },
      { property: "og:title", content: "Admin roles & permissions | Ashnight Admin" },
      {
        property: "og:description",
        content: "Grant or withhold control-room areas, edit rights and exports per admin.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminRoles,
});

const GROUPS = ["Operations", "Money", "Trust & safety", "Platform"] as const;

function AdminRoles() {
  const access = useAdminAccess();
  const roster = useAdminRoster();
  const [selected, setSelected] = useState<string | null>(null);

  const entries = roster.data ?? [];
  const active = entries.find((entry) => entry.userId === selected) ?? entries[0] ?? null;

  if (!access.loading && !access.superAdmin) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <ShieldX className="mx-auto size-6 text-muted-foreground" />
        <h1 className="mt-3 font-display text-lg font-semibold">Super admins only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only a super admin can change what other administrators are allowed to do.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-primary">Access control</p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Admin roles &amp; permissions
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Super admins decide which parts of the control room each administrator can open,
            whether they may change anything, and whether they can export data. Promote a member to
            admin from the Users page first — they'll appear here.
          </p>
        </div>
        <ExportMenu
          filename="ashnight-admin-permissions"
          title="Admin permissions"
          columns={[
            { label: "Admin", value: (row: AdminRosterEntry) => row.displayName },
            { label: "Username", value: (row) => row.username ?? "" },
            { label: "Super admin", value: (row) => (row.permissions?.super_admin ? "Yes" : "No") },
            { label: "Read only", value: (row) => (row.permissions?.read_only ? "Yes" : "No") },
            { label: "Can export", value: (row) => (row.permissions?.can_export ? "Yes" : "No") },
            { label: "Areas", value: (row) => (row.permissions?.areas ?? []).join(" | ") },
            { label: "Note", value: (row) => row.permissions?.note ?? "" },
          ]}
          rows={entries}
        />
      </header>

      <GrantAdminCard existing={entries.map((entry) => entry.userId)} />

      {roster.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading administrators…
        </div>
      ) : entries.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No admin accounts yet — use “Add an administrator” above.
        </Card>
      ) : (

        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <Card className="divide-y divide-border/70 p-0">
            {entries.map((entry) => {
              const isActive = active?.userId === entry.userId;
              return (
                <button
                  key={entry.userId}
                  type="button"
                  onClick={() => setSelected(entry.userId)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                    isActive ? "bg-secondary" : "hover:bg-secondary/50"
                  }`}
                >
                  <Avatar className="size-8 border border-border">
                    <AvatarFallback className="bg-surface-strong text-[11px]">
                      {initials(entry.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{entry.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {entry.permissions?.super_admin
                        ? "Super admin"
                        : `${entry.permissions?.areas.length ?? 0} area${
                            (entry.permissions?.areas.length ?? 0) === 1 ? "" : "s"
                          }`}
                    </p>
                  </div>
                  {entry.permissions?.super_admin ? (
                    <ShieldCheck className="size-4 shrink-0 text-primary" />
                  ) : null}
                </button>
              );
            })}
          </Card>

          {active ? <PermissionEditor key={active.userId} entry={active} /> : null}
        </div>
      )}
    </div>
  );
}

function PermissionEditor({ entry }: { entry: AdminRosterEntry }) {
  const { save, revoke } = useAdminPermissionMutations();
  const [superAdmin, setSuperAdmin] = useState(Boolean(entry.permissions?.super_admin));
  const [areas, setAreas] = useState<string[]>(entry.permissions?.areas ?? []);
  const [readOnly, setReadOnly] = useState(Boolean(entry.permissions?.read_only));
  const [canExport, setCanExport] = useState(entry.permissions?.can_export ?? true);
  const [note, setNote] = useState(entry.permissions?.note ?? "");

  useEffect(() => {
    setSuperAdmin(Boolean(entry.permissions?.super_admin));
    setAreas(entry.permissions?.areas ?? []);
    setReadOnly(Boolean(entry.permissions?.read_only));
    setCanExport(entry.permissions?.can_export ?? true);
    setNote(entry.permissions?.note ?? "");
  }, [entry]);

  const grouped = useMemo(
    () => GROUPS.map((group) => ({ group, items: ADMIN_AREAS.filter((a) => a.group === group) })),
    [],
  );

  function toggle(key: string, on: boolean) {
    setAreas((current) =>
      on ? [...new Set([...current, key])] : current.filter((area) => area !== key),
    );
  }

  async function submit() {
    try {
      await save.mutateAsync({ userId: entry.userId, superAdmin, areas, readOnly, canExport, note });
      toast.success(`Permissions saved for ${entry.displayName}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save permissions.");
    }
  }

  async function clear() {
    try {
      await revoke.mutateAsync(entry.userId);
      toast.success(`Control-room access removed for ${entry.displayName}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove access.");
    }
  }

  return (
    <Card className="space-y-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{entry.displayName}</h2>
          <p className="text-xs text-muted-foreground">
            {entry.username ? `@${entry.username} · ` : ""}
            {entry.permissions ? "Permissions on file" : "No permission record yet"}
          </p>
        </div>
        <Badge variant={superAdmin ? "default" : "secondary"} className="gap-1">
          <UserCog className="size-3" /> {superAdmin ? "Super admin" : "Scoped admin"}
        </Badge>
      </div>

      <AccountControls entry={entry} />



      <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="text-sm font-medium">Super admin</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Full access to every area, including this page. Super admins can never be limited.
            </span>
          </span>
          <Switch checked={superAdmin} onCheckedChange={setSuperAdmin} />
        </label>
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="text-sm font-medium">View only</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Let them read the areas below without saving changes.
            </span>
          </span>
          <Switch checked={readOnly} disabled={superAdmin} onCheckedChange={setReadOnly} />
        </label>
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="text-sm font-medium">Allow exports</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Download CSV, Excel, PDF and Word reports from the areas they can open.
            </span>
          </span>
          <Switch checked={canExport} disabled={superAdmin} onCheckedChange={setCanExport} />
        </label>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">
            Areas they can open
            {superAdmin ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                locked — turn off “Super admin” to choose areas
              </span>
            ) : null}
          </h3>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={superAdmin}
              onClick={() => setAreas(ADMIN_AREAS.map((area) => area.key))}
            >
              Select all
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={superAdmin}
              onClick={() => setAreas([])}
            >
              Clear
            </Button>
          </div>
        </div>

        {grouped.map(({ group, items }) => (
          <div key={group} className="space-y-2">
            <p className="eyebrow text-muted-foreground">{group}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((area) => (
                <label
                  key={area.key}
                  className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={superAdmin || areas.includes(area.key)}
                    disabled={superAdmin}
                    onCheckedChange={(value) => toggle(area.key, value === true)}
                  />
                  {area.label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="perm-note">Internal note</Label>
        <Input
          id="perm-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Why this admin has this scope"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void submit()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Save permissions
        </Button>
        {entry.permissions ? (
          <Button variant="outline" onClick={() => void clear()} disabled={revoke.isPending}>
            Remove permission record
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

/** Promote any existing member to administrator. */
function GrantAdminCard({ existing }: { existing: string[] }) {
  const profiles = useAllProfiles();
  const queryClient = useQueryClient();
  const readAccount = useServerFn(getUserAccount);
  const saveAccount = useServerFn(updateUserAccount);
  const [userId, setUserId] = useState("");

  const candidates = useMemo(
    () =>
      (profiles.data ?? [])
        .filter((row) => !existing.includes(row.id))
        .sort((a, b) => (a.display_name ?? "").localeCompare(b.display_name ?? "")),
    [profiles.data, existing],
  );

  const grant = useMutation({
    mutationFn: async (id: string) => {
      const account = await readAccount({ data: { userId: id } });
      const roles = [...new Set([...(account.roles ?? []), "admin" as AppRole])];
      await saveAccount({ data: { userId: id, fields: {}, roles } });
    },
    onSuccess: async () => {
      setUserId("");
      toast.success("Administrator added.");
      await queryClient.invalidateQueries({ queryKey: ["admin-roster"] });
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not add that administrator."),
  });

  return (
    <Card className="flex flex-wrap items-end gap-3 p-5">
      <div className="min-w-[16rem] flex-1 space-y-2">
        <Label>Add an administrator</Label>
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger>
            <SelectValue
              placeholder={profiles.isLoading ? "Loading members…" : "Choose a member"}
            />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.display_name}
                {row.username ? ` · @${row.username}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          The member keeps their existing roles and gains control-room access. Set their areas below
          after adding them.
        </p>
      </div>
      <Button disabled={!userId || grant.isPending} onClick={() => grant.mutate(userId)}>
        {grant.isPending ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <UserPlus className="mr-2 size-4" />
        )}
        Make administrator
      </Button>
    </Card>
  );
}

/** Roles and account state for one administrator. */
function AccountControls({ entry }: { entry: AdminRosterEntry }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const saveAccount = useServerFn(updateUserAccount);

  const [roles, setRoles] = useState<AppRole[]>(entry.roles as AppRole[]);
  const [status, setStatus] = useState<AccountStatus>(entry.accountStatus ?? "active");
  const [reason, setReason] = useState("");

  useEffect(() => {
    setRoles(entry.roles as AppRole[]);
    setStatus(entry.accountStatus ?? "active");
    setReason("");
  }, [entry]);

  const isSelf = user?.id === entry.userId;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!roles.length) throw new Error("Give this account at least one role.");
      if (isSelf && !roles.includes("admin")) {
        throw new Error("You can't remove your own administrator role.");
      }
      if (isSelf && status !== "active") {
        throw new Error("You can't block your own account.");
      }
      await saveAccount({
        data: {
          userId: entry.userId,
          roles,
          fields: {
            account_status: status,
            suspended: status === "suspended" || status === "banned",
            ...(reason.trim() ? { status_reason: reason.trim() } : {}),
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success(`Account updated for ${entry.displayName}.`);
      await queryClient.invalidateQueries({ queryKey: ["admin-roster"] });
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update that account."),
  });

  function toggleRole(role: AppRole, on: boolean) {
    setRoles((current) =>
      on ? [...new Set([...current, role])] : current.filter((item) => item !== role),
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Roles &amp; account state</h3>
        <Badge variant="outline" className={statusBadgeClass(entry.accountStatus ?? "active")}>
          {ACCOUNT_STATUS_META[entry.accountStatus ?? "active"].label}
        </Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {ROLE_OPTIONS.map((role) => (
          <label
            key={role.key}
            className="flex items-start justify-between gap-3 rounded-lg border border-border/70 px-3 py-2"
          >
            <span>
              <span className="text-sm font-medium">{role.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{role.blurb}</span>
            </span>
            <Switch
              checked={roles.includes(role.key)}
              disabled={isSelf && role.key === "admin"}
              onCheckedChange={(value) => toggleRole(role.key, value)}
            />
          </label>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Account status</Label>
          <Select value={status} onValueChange={(value) => setStatus(value as AccountStatus)}>
            <SelectTrigger disabled={isSelf}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_STATUSES.map((option) => (
                <SelectItem key={option} value={option}>
                  {ACCOUNT_STATUS_META[option].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {ACCOUNT_STATUS_META[status].blurb}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`reason-${entry.userId}`}>Reason (optional)</Label>
          <Input
            id={`reason-${entry.userId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Shown in the activity log"
          />
        </div>
      </div>

      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        Save roles &amp; status
      </Button>
      {isSelf ? (
        <p className="text-xs text-muted-foreground">
          This is your own account — your admin role and status are locked to keep you signed in.
        </p>
      ) : null}
    </div>
  );
}

