import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Ban, MoreHorizontal, Search, ShieldCheck, Star } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TierBadge } from "@/components/tier-badge";
import { clients, specialists } from "@/lib/mock-data";
import { money, type Tier } from "@/lib/types";

export const Route = createFileRoute("/admin/users")({
  head: () => ({
    meta: [
      { title: "Members & Specialists | Ashnight Admin" },
      {
        name: "description",
        content:
          "Manage every Ashnight account: membership status, room placement, lifetime spend, ratings and suspensions.",
      },
      { property: "og:title", content: "Members & Specialists | Ashnight Admin" },
      {
        property: "og:description",
        content: "Search accounts, move people between rooms, and suspend when needed.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminUsers,
});

type Segment = "clients" | "specialists";

function AdminUsers() {
  const [segment, setSegment] = useState<Segment>("clients");
  const [query, setQuery] = useState("");
  const [rooms, setRooms] = useState<Record<string, Tier>>({});

  const roomOf = (id: string, fallback: Tier) => rooms[id] ?? fallback;

  const filteredClients = useMemo(
    () =>
      clients.filter((client) =>
        `${client.name} ${client.city}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );

  const filteredSpecialists = useMemo(
    () =>
      specialists.filter((specialist) =>
        `${specialist.name} ${specialist.city}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );

  function move(id: string, name: string, tier: Tier) {
    setRooms((current) => ({ ...current, [id]: tier }));
    toast.success(`${name} moved to the ${tier} room`);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow text-primary">Accounts</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Members &amp; specialists
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {clients.length} members and {specialists.length} specialists, all human-approved.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={segment} onValueChange={(value) => setSegment(value as Segment)}>
          <TabsList>
            <TabsTrigger value="clients">Members</TabsTrigger>
            <TabsTrigger value="specialists">Specialists</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or city"
            className="pl-9"
            aria-label="Search accounts"
          />
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>{segment === "clients" ? "Membership" : "Rating"}</TableHead>
                <TableHead className="text-right">
                  {segment === "clients" ? "Lifetime spend" : "Jobs"}
                </TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {segment === "clients"
                ? filteredClients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium">{client.name}</TableCell>
                      <TableCell className="text-muted-foreground">{client.city}</TableCell>
                      <TableCell>
                        <TierBadge tier={roomOf(client.id, client.room)} />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            client.subscriptionStatus === "active"
                              ? "border-success/40 text-success"
                              : client.subscriptionStatus === "past_due"
                                ? "border-warning/40 text-warning"
                                : "border-border text-muted-foreground"
                          }
                        >
                          {client.subscriptionStatus.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {money(client.lifetimeSpend)}
                      </TableCell>
                      <TableCell>
                        <RowMenu
                          name={client.name}
                          onMove={(tier) => move(client.id, client.name, tier)}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                : filteredSpecialists.map((specialist) => (
                    <TableRow key={specialist.id}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-1.5">
                          {specialist.name}
                          {specialist.verified ? (
                            <ShieldCheck className="size-3.5 text-accent" />
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {specialist.city}
                      </TableCell>
                      <TableCell>
                        <TierBadge tier={roomOf(specialist.id, specialist.room)} />
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1">
                          <Star className="size-3.5 fill-primary text-primary" />
                          {specialist.rating.toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {specialist.jobsCompleted}
                      </TableCell>
                      <TableCell>
                        <RowMenu
                          name={specialist.name}
                          onMove={(tier) => move(specialist.id, specialist.name, tier)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function RowMenu({ name, onMove }: { name: string; onMove: (tier: Tier) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${name}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Move to room</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onMove("basic")}>Basic</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onMove("premium")}>Premium</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onMove("ultimate")}>Ultimate</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => toast(`${name} suspended pending review`)}
        >
          <Ban className="size-4" /> Suspend account
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
