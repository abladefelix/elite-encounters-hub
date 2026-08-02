import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CircleDollarSign, Filter, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExportMenu } from "@/components/admin/export-menu";
import { DataPager, usePaged } from "@/components/ui/data-pager";
import { Card } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TierBadge } from "@/components/tier-badge";
import { bookings as seedBookings, getClient, getSpecialist } from "@/lib/mock-data";
import { bookingTotal, money, type BookingStatus } from "@/lib/types";

export const Route = createFileRoute("/ashnight-control/bookings")({
  head: () => ({
    meta: [
      { title: "Bookings & Payouts | Ashnight Admin" },
      {
        name: "description",
        content:
          "Track every Ashnight ash booking: held payments, completed visits, platform fees, disputes and specialist payouts.",
      },
      { property: "og:title", content: "Bookings & Payouts | Ashnight Admin" },
      {
        property: "og:description",
        content: "Held funds, completed visits, platform fees and dispute resolution.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminBookings,
});

const STATUS_STYLE: Record<BookingStatus, string> = {
  requested: "border-border text-muted-foreground",
  accepted: "border-primary/40 text-primary",
  paid: "border-accent/40 text-accent",
  completed: "border-success/40 text-success",
  cancelled: "border-border text-muted-foreground",
  disputed: "border-destructive/40 text-destructive",
};

function AdminBookings() {
  const [status, setStatus] = useState<BookingStatus | "all">("all");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return seedBookings.filter((booking) => {
      if (status !== "all" && booking.status !== status) return false;
      if (!term) return true;
      const haystack = [
        booking.service,
        booking.id,
        getClient(booking.clientId)?.name ?? "",
        getSpecialist(booking.specialistId)?.name ?? "",
        ...booking.addons,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [status, search]);

  const paged = usePaged(rows, 25);

  const held = seedBookings
    .filter((booking) => booking.status === "paid" || booking.status === "accepted")
    .reduce((sum, booking) => sum + bookingTotal(booking).total, 0);
  const fees = seedBookings
    .filter((booking) => booking.status === "completed")
    .reduce((sum, booking) => sum + bookingTotal(booking).fee, 0);

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow text-primary">Ledger</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Bookings &amp; payouts
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Money is held until a member confirms the visit is done. Disputes freeze the payout
          until a reviewer closes them.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Funds held
          </p>
          <p className="mt-3 font-display text-2xl font-semibold">{money(held)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Platform fees earned
          </p>
          <p className="mt-3 font-display text-2xl font-semibold">{money(fees)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Open disputes
          </p>
          <p className="mt-3 font-display text-2xl font-semibold">
            {seedBookings.filter((booking) => booking.status === "disputed").length}
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by service, member, specialist or add-on"
            aria-label="Search bookings"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div>
          <ExportMenu
            filename="ashnight-bookings"
            title="Bookings & payouts"
            columns={[
              { label: "Booking", value: (row: (typeof rows)[number]) => row.id },
              { label: "Service", value: (row: (typeof rows)[number]) => row.service },
              { label: "Client", value: (row: (typeof rows)[number]) => getClient(row.clientId)?.name ?? "" },
              {
                label: "Specialist",
                value: (row: (typeof rows)[number]) => getSpecialist(row.specialistId)?.name ?? "",
              },
              { label: "Add-ons", value: (row: (typeof rows)[number]) => row.addons.join(" | ") },
              { label: "Status", value: (row: (typeof rows)[number]) => row.status },
              { label: "Total", value: (row: (typeof rows)[number]) => bookingTotal(row).total },
              { label: "Platform fee", value: (row: (typeof rows)[number]) => bookingTotal(row).fee },
            ]}
            rows={rows}
            size="default"
          />
        </div>
        <Filter className="size-4 text-muted-foreground" />
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as BookingStatus | "all")}
        >
          <SelectTrigger className="w-48" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="requested">Requested</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="paid">Paid — held</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="disputed">Disputed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Member</TableHead>
                <TableHead>Specialist</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    No bookings match this search.
                  </TableCell>
                </TableRow>
              ) : null}
              {paged.rows.map((booking) => {
                const specialist = getSpecialist(booking.specialistId);
                const totals = bookingTotal(booking);
                return (
                  <TableRow key={booking.id}>
                    <TableCell className="font-medium">
                      {booking.service}
                      <span className="block text-xs text-muted-foreground">
                        {booking.hours}h
                        {booking.addons.length ? ` · +${booking.addons.length} add-ons` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {getClient(booking.clientId)?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {specialist?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      {specialist ? <TierBadge tier={specialist.room} /> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(booking.scheduledFor).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] capitalize ${STATUS_STYLE[booking.status]}`}
                      >
                        {booking.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {money(totals.total)}
                      <span className="block text-xs text-muted-foreground">
                        fee {money(totals.fee)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          toast(
                            booking.status === "disputed"
                              ? `Dispute ${booking.id} opened for review`
                              : `Payout for ${booking.id} released to ${specialist?.name}`,
                          )
                        }
                      >
                        <CircleDollarSign className="size-4" />
                        {booking.status === "disputed" ? "Review" : "Release"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="border-t border-border p-3">
          <DataPager paged={paged} label="bookings" />
        </div>
      </Card>
    </div>
  );
}
