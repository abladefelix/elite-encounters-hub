/**
 * Control room → Demo data.
 *
 * One button populates the whole platform with a realistic Ghanaian dataset
 * (members, rooms, bookings, escrow, chat, moderation, complaints, documents),
 * and one button removes every demo row again. Real member data is never
 * touched — the seeder keeps a manifest of exactly what it created.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Loader2, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDemoStatus, populateDemoData, removeDemoData } from "@/lib/demo-data.functions";

export const Route = createFileRoute("/ashnight-control/demo")({
  head: () => ({
    meta: [
      { title: "Demo Data | Ashnight Admin" },
      {
        name: "description",
        content:
          "Populate Ashnight with a realistic demo dataset covering members, bookings, escrow, chat and complaints — then remove it in one click.",
      },
      { property: "og:title", content: "Demo Data | Ashnight Admin" },
      {
        property: "og:description",
        content: "Seed or wipe the Ashnight demo dataset from the control room.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminDemoData,
});

const COVERAGE = [
  "6 services in the catalogue",
  "4 vetted specialists with Ghanaian portraits, rooms and rates",
  "4 clients with memberships (one past due)",
  "4 vetting applications across every status",
  "4 chat threads with 28 messages, one redacted",
  "5 bookings spanning requested → disputed",
  "7 escrow entries plus two cash gifts",
  "3 invoices and receipts in GHS",
  "Ratings, reports, moderation hits, complaints, notifications and audit trails",
];

function AdminDemoData() {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ["demo-status"],
    queryFn: () => getDemoStatus(),
    refetchOnWindowFocus: false,
  });

  const refreshAll = () => {
    void queryClient.invalidateQueries();
  };

  const seed = useMutation({
    mutationFn: () => populateDemoData(),
    onSuccess: (result) => {
      toast.success("Demo data populated across every module.", {
        description: `${result.counts["specialists"] ?? 0} specialists, ${
          result.counts["clients"] ?? 0
        } clients, ${result.counts["bookings"] ?? 0} bookings.`,
      });
      refreshAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const clear = useMutation({
    mutationFn: () => removeDemoData(),
    onSuccess: (result) => {
      toast.success(`Demo data removed (${result.removedUsers} demo accounts deleted).`);
      refreshAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const status = statusQuery.data;
  const busy = seed.isPending || clear.isPending;
  const counts = Object.entries(status?.counts ?? {});

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl">Demo data</h1>
        <p className="text-sm text-muted-foreground">
          Fill the platform with a realistic dataset for demos and training, then remove it when
          you're ready for live members. Only rows created by this seeder are ever deleted.
        </p>
      </header>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Database className="size-4 text-primary" />
            {statusQuery.isLoading ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Checking…
              </span>
            ) : status?.seeded ? (
              <>
                Demo data is live
                <Badge className="bg-primary/15 text-primary">
                  since {new Date(status.seededAt!).toLocaleString()}
                </Badge>
              </>
            ) : (
              <>
                No demo data present
                <Badge variant="secondary">Clean database</Badge>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => void statusQuery.refetch()}>
              <RefreshCw className="mr-2 size-4" /> Refresh
            </Button>
            <Button size="sm" disabled={busy} onClick={() => seed.mutate()}>
              {seed.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Database className="mr-2 size-4" />
              )}
              {status?.seeded ? "Repopulate demo data" : "Populate demo data"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy || !status?.seeded}
              onClick={() => clear.mutate()}
            >
              {clear.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 size-4" />
              )}
              Remove demo data
            </Button>
          </div>
        </div>

        {status?.seeded ? (
          <div className="mt-5 space-y-3 border-t border-border pt-4 text-sm">
            <p className="text-muted-foreground">
              Demo accounts use the <code>@{status.domain}</code> domain and the shared password{" "}
              <code>{status.password}</code>. Sign in as any of them to see the member experience.
            </p>
            <div className="flex flex-wrap gap-2">
              {counts.map(([key, value]) => (
                <Badge key={key} variant="secondary" className="font-normal">
                  {key.replace(/_/g, " ")}: {value}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-display text-lg">What gets created</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {COVERAGE.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                {item}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-display text-lg">
            <TriangleAlert className="size-4 text-amber-500" /> Before you go live
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Repopulating first removes the existing demo set, so counts never double up. Remove the
            demo data before launch day — real members, bookings, escrow entries and your admin
            account are untouched either way.
          </p>
        </Card>
      </div>
    </div>
  );
}
