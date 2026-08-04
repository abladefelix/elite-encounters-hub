import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, Users, ShieldCheck, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TierBadge } from "@/components/tier-badge";
import { money } from "@/lib/types";

// Mock data for groups until backend is ready
const MOCK_GROUPS = [
  {
    id: "grp-01",
    name: "Luxury Loft Team",
    leadName: "Amara Osei",
    memberCount: 3,
    room: "ultimate",
    rate: 180,
    status: "active",
  },
  {
    id: "grp-02",
    name: "Express Clean Crew",
    leadName: "Lucia Ferrante",
    memberCount: 2,
    room: "premium",
    rate: 110,
    status: "active",
  },
  {
    id: "grp-03",
    name: "Weekend Warriors",
    leadName: "Grace Mwangi",
    memberCount: 4,
    room: "basic",
    rate: 140,
    status: "draft",
  },
];

export const Route = createFileRoute("/ashnight-control/groups")({
  head: () => ({
    meta: [
      { title: "Specialist Groups | Ashnight Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminGroups,
});

function AdminGroups() {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    return MOCK_GROUPS.filter((g) =>
      g.name.toLowerCase().includes(query.toLowerCase()) ||
      g.leadName.toLowerCase().includes(query.toLowerCase())
    );
  }, [query]);

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow text-primary">Teams</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Specialist Groups
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Combine vetted specialists into high-performance teams. Group bookings allow clients to hire
          multiple specialists in a single transaction managed by a team lead.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search group or lead..."
            className="pl-9"
          />
        </div>
        <Button onClick={() => toast.info("Create Group modal would open here")}>
          <Plus className="size-4" />
          Create group
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Group Name</TableHead>
              <TableHead>Team Lead</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Room</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((group) => (
              <TableRow key={group.id}>
                <TableCell className="font-medium">{group.name}</TableCell>
                <TableCell>{group.leadName}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Users className="size-3.5" />
                    {group.memberCount}
                  </div>
                </TableCell>
                <TableCell>
                  <TierBadge tier={group.room as any} />
                </TableCell>
                <TableCell>{money(group.rate)}/h</TableCell>
                <TableCell>
                  <Badge variant={group.status === "active" ? "success" : "secondary"} className="capitalize">
                    {group.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem>
                        <Pencil className="size-4" /> Edit Group
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <ShieldCheck className="size-4" /> Manage Team
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive">
                        <Trash2 className="size-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Group Visibility Rules</CardTitle>
            <CardDescription>How groups appear to clients in the directory.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-start gap-3">
              <div className="mt-1 size-2 rounded-full bg-primary" />
              <div>
                <p className="font-medium">Tier Matching</p>
                <p className="text-muted-foreground">Groups inherit the room tier of their Lead Specialist. Clients must have appropriate room access to book the group.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 size-2 rounded-full bg-primary" />
              <div>
                <p className="font-medium">Direct Booking</p>
                <p className="text-muted-foreground">Group bookings bypass individual availability checks; the Lead manages scheduling for the whole team.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Wallet & Payouts</CardTitle>
            <CardDescription>Escrow management for collective work.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-start gap-3">
              <div className="mt-1 size-2 rounded-full bg-accent" />
              <div>
                <p className="font-medium">Single Payout (Default)</p>
                <p className="text-muted-foreground">The full booking amount is released to the Lead Specialist's wallet. They are responsible for internal team distribution.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 size-2 rounded-full bg-accent" />
              <div>
                <p className="font-medium">Platform Split (Advanced)</p>
                <p className="text-muted-foreground">Admins can define pro-rata splits per member to be executed automatically upon booking completion.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
