import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Loader2, Pencil, Search, ShieldBan, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataPager, usePaged } from "@/components/ui/data-pager";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { TierBadge } from "@/components/tier-badge";
import { UserEditorDialog } from "@/components/admin/user-editor-dialog";
import { deleteUserAccount } from "@/lib/admin-users.functions";
import { useAllProfiles, useUpdateProfile, type ProfileRow } from "@/lib/queries";
import { releaseAbandonedSignups, setAccountStatus } from "@/lib/identity.functions";
import {
  ACCOUNT_STATUSES,
  ACCOUNT_STATUS_META,
  formatGhanaCard,
  statusBadgeClass,
  type AccountStatus,
} from "@/lib/account-status";
import { initials, money, type Tier } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ashnight-control/users")({
  head: () => ({
    meta: [
      { title: "Members & Specialists | Ashnight Admin" },
      {
        name: "description",
        content:
          "Manage every Ashnight account: room placement, Ghana Card details, bans, suspensions and reactivations.",
      },
      { property: "og:title", content: "Members & Specialists | Ashnight Admin" },
      {
        property: "og:description",
        content: "Search accounts, move people between rooms, and ban or reinstate when needed.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminUsers,
});

type Segment = "clients" | "specialists";

const TIERS: Tier[] = ["basic", "premium", "ultimate"];

function AdminUsers() {
  const profilesQuery = useAllProfiles();
  const updateProfile = useUpdateProfile();
  const [segment, setSegment] = useState<Segment>("clients");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "all">("all");
  const [target, setTarget] = useState<{ profile: ProfileRow; status: AccountStatus } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [editor, setEditor] = useState<{ open: boolean; profile: ProfileRow | null }>({
    open: false,
    profile: null,
  });
  const [removing, setRemoving] = useState<ProfileRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function removeAccount() {
    if (!removing) return;
    setDeleting(true);
    try {
      await deleteUserAccount({ data: { userId: removing.id } });
      toast.success(`${removing.display_name} deleted`);
      setRemoving(null);
      await profilesQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  const rows = useMemo(() => {
    const all = profilesQuery.data ?? [];
    const term = query.trim().toLowerCase();
    return all
      .filter((row) => (segment === "specialists" ? !!row.room || row.hourly_rate > 0 : true))
      .filter((row) =>
        statusFilter === "all" ? true : (row.account_status as AccountStatus) === statusFilter,
      )
      .filter((row) =>
        term
          ? `${row.display_name} ${row.username ?? ""} ${row.city} ${row.phone ?? ""} ${
              row.ghana_card_number ?? ""
            }`
              .toLowerCase()
              .includes(term)
          : true,
      );
  }, [profilesQuery.data, query, segment, statusFilter]);

  async function applyStatus() {
    if (!target) return;
    const needsReason = target.status !== "active" && target.status !== "pending";
    if (needsReason && reason.trim().length < 4) {
      toast.error("Add a short reason — it's stored on the audit trail and sent to the member.");
      return;
    }
    setBusy(true);
    try {
      await setAccountStatus({
        data: { userId: target.profile.id, status: target.status, reason: reason.trim() },
      });
      toast.success(
        `${target.profile.display_name} is now ${ACCOUNT_STATUS_META[target.status].label.toLowerCase()}`,
      );
      setTarget(null);
      setReason("");
      await profilesQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That change didn't go through.");
    } finally {
      setBusy(false);
    }
  }

  function move(row: ProfileRow, tier: Tier) {
    updateProfile.mutate(
      { id: row.id, patch: { room: tier } },
      {
        onSuccess: () => toast.success(`${row.display_name} moved to the ${tier} room`),
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Room change failed"),
      },
    );
  }

  async function reclaim() {
    setReleasing(true);
    try {
      const result = await releaseAbandonedSignups({ data: { hours: 48 } });
      toast.success(
        result.released
          ? `${result.released} abandoned sign-up${result.released === 1 ? "" : "s"} released`
          : "Nothing to release — no stale unconfirmed sign-ups.",
        {
          description:
            "Their username, email, phone and Ghana Card number are free for someone else now.",
        },
      );
      await profilesQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Release failed.");
    } finally {
      setReleasing(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow text-primary">Accounts</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Members &amp; specialists
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {(profilesQuery.data ?? []).length} accounts on file. Banning or suspending someone kills
          their live sessions immediately and notifies them with your reason.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={segment} onValueChange={(value) => setSegment(value as Segment)}>
          <TabsList>
            <TabsTrigger value="clients">Everyone</TabsTrigger>
            <TabsTrigger value="specialists">Specialists</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, username, phone or Ghana Card"
            className="pl-9"
            aria-label="Search accounts"
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as AccountStatus | "all")}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {ACCOUNT_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {ACCOUNT_STATUS_META[status].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" onClick={() => void reclaim()} disabled={releasing}>
          {releasing ? <Loader2 className="size-4 animate-spin" /> : "Release abandoned sign-ups"}
        </Button>

        <Button onClick={() => setEditor({ open: true, profile: null })}>
          <UserPlus className="size-4" />
          Add member
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Identity</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profilesQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center">
                    <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : null}

              {paged.rows.map((row) => {
                const status = (row.account_status ?? "pending") as AccountStatus;
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9 border border-border">
                          {row.avatar_url ? (
                            <AvatarImage src={row.avatar_url} alt={row.display_name} />
                          ) : null}
                          <AvatarFallback className="text-xs">
                            {initials(row.display_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{row.display_name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {row.username ? `@${row.username}` : "no username"} · {row.city || "—"}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      <p>{row.phone || "no phone"}</p>
                      <p>
                        {row.ghana_card_number
                          ? formatGhanaCard(row.ghana_card_number)
                          : "no Ghana Card"}
                      </p>
                      {row.hourly_rate > 0 ? <p>{money(row.hourly_rate)}/h</p> : null}
                    </TableCell>

                    <TableCell>{row.room ? <TierBadge tier={row.room} /> : "—"}</TableCell>

                    <TableCell>
                      <Badge variant="outline" className={cn("uppercase", statusBadgeClass(status))}>
                        {ACCOUNT_STATUS_META[status].label}
                      </Badge>
                      {row.status_reason ? (
                        <p className="mt-1 max-w-[15rem] truncate text-xs text-muted-foreground">
                          {row.status_reason}
                        </p>
                      ) : null}
                    </TableCell>

                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            Manage
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem
                            onClick={() => setEditor({ open: true, profile: row })}
                          >
                            <Pencil className="size-4" />
                            Edit everything
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>Room placement</DropdownMenuLabel>
                          {TIERS.map((tier) => (
                            <DropdownMenuItem key={tier} onClick={() => move(row, tier)}>
                              Move to {tier}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>Account status</DropdownMenuLabel>
                          {ACCOUNT_STATUSES.filter((value) => value !== status).map((value) => (
                            <DropdownMenuItem
                              key={value}
                              onClick={() => {
                                setTarget({ profile: row, status: value });
                                setReason(row.status_reason ?? "");
                              }}
                            >
                              {value === "active" ? (
                                <ShieldCheck className="size-4" />
                              ) : (
                                <ShieldBan className="size-4" />
                              )}
                              {ACCOUNT_STATUS_META[value].label}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setRemoving(row)}
                          >
                            <Trash2 className="size-4" />
                            Delete account
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}

              {!profilesQuery.isLoading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    No accounts match that search.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
        <div className="border-t border-border p-3">
          <DataPager paged={paged} label="accounts" />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What each status does</CardTitle>
          <CardDescription>
            Deactivated, suspended and banned accounts cannot sign in, chat or pay.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {ACCOUNT_STATUSES.map((status) => (
            <div key={status} className="rounded-lg border border-border p-3">
              <Badge variant="outline" className={cn("uppercase", statusBadgeClass(status))}>
                {ACCOUNT_STATUS_META[status].label}
              </Badge>
              <p className="mt-2 text-sm text-muted-foreground">
                {ACCOUNT_STATUS_META[status].blurb}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <UserEditorDialog
        open={editor.open}
        onOpenChange={(open) => setEditor((prev) => ({ ...prev, open }))}
        profile={editor.profile}
        onSaved={() => profilesQuery.refetch()}
      />

      <Dialog open={!!removing} onOpenChange={(open) => (!open ? setRemoving(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {removing?.display_name}?</DialogTitle>
            <DialogDescription>
              This removes the sign-in, the profile and everything linked to it. It cannot be
              undone — suspend or ban instead if you may need the history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void removeAccount()} disabled={deleting}>
              {deleting ? <Loader2 className="size-4 animate-spin" /> : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!target} onOpenChange={(open) => (!open ? setTarget(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target ? `${ACCOUNT_STATUS_META[target.status].label} ${target.profile.display_name}` : ""}
            </DialogTitle>
            <DialogDescription>
              {target ? ACCOUNT_STATUS_META[target.status].blurb : ""} The member is notified with
              the reason you write here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="status-reason">Reason</Label>
            <Textarea
              id="status-reason"
              rows={4}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Repeated attempts to take a booking off-platform."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => void applyStatus()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
