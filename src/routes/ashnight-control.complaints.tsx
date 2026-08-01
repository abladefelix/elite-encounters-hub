import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useProfiles } from "@/lib/queries";
import { useComplaintMutations, useComplaints, type ComplaintState } from "@/lib/support";

export const Route = createFileRoute("/ashnight-control/complaints")({
  head: () => ({
    meta: [
      { title: "Complaints | Ashnight Admin" },
      {
        name: "description",
        content:
          "Triage member and specialist complaints, add internal notes and publish a resolution back to the member.",
      },
      { property: "og:title", content: "Complaints | Ashnight Admin" },
      { property: "og:description", content: "Ashnight complaint triage queue." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminComplaints,
});

const STATES: ComplaintState[] = ["open", "investigating", "resolved", "dismissed"];

const STATE_TONE: Record<ComplaintState, string> = {
  open: "border-destructive/40 text-destructive",
  investigating: "border-primary/40 text-primary",
  resolved: "border-emerald-500/40 text-emerald-500",
  dismissed: "border-border text-muted-foreground",
};

function AdminComplaints() {
  const { user } = useAuth();
  const complaints = useComplaints();
  const { update } = useComplaintMutations();
  const [filter, setFilter] = useState<ComplaintState | "all">("open");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { note: string; resolution: string }>>({});

  const ids = useMemo(
    () => [...new Set((complaints.data ?? []).map((row) => row.user_id).filter(Boolean))] as string[],
    [complaints.data],
  );
  const profiles = useProfiles(ids);
  const nameFor = (id: string | null) =>
    (profiles.data ?? []).find((row) => row.id === id)?.display_name ?? "Member";

  const rows = (complaints.data ?? [])
    .filter((row) => (filter === "all" ? true : row.state === filter))
    .filter((row) =>
      search.trim()
        ? `${row.subject} ${row.body} ${row.category}`.toLowerCase().includes(search.toLowerCase())
        : true,
    );

  function draft(id: string, current: { note: string; resolution: string }) {
    return drafts[id] ?? current;
  }

  async function apply(id: string, state: ComplaintState, values: { note: string; resolution: string }) {
    try {
      await update.mutateAsync({
        id,
        state,
        adminNote: values.note,
        resolution: values.resolution,
        handledBy: user?.id,
      });
      toast.success(`Complaint marked ${state}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    }
  }

  const openCount = (complaints.data ?? []).filter((row) => row.state === "open").length;

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow text-primary">Support</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Complaints
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {openCount} open. Anything written into “Resolution” is shown to the member in their inbox;
          internal notes stay in the control room.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Select value={filter} onValueChange={(value) => setFilter(value as ComplaintState | "all")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All complaints</SelectItem>
            {STATES.map((state) => (
              <SelectItem key={state} value={state}>
                {state}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search subject or body"
          className="w-full sm:max-w-xs"
          aria-label="Search complaints"
        />
      </div>

      {complaints.isLoading ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : null}

      {rows.length === 0 && !complaints.isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nothing in this queue.
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-4">
        {rows.map((row) => {
          const values = draft(row.id, {
            note: row.admin_note ?? "",
            resolution: row.resolution ?? "",
          });
          return (
            <Card key={row.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{row.subject}</CardTitle>
                  <Badge variant="outline" className={`uppercase ${STATE_TONE[row.state]}`}>
                    {row.state}
                  </Badge>
                  <Badge variant="secondary">{row.category}</Badge>
                </div>
                <CardDescription>
                  {nameFor(row.user_id)} · {row.contact_email || "no contact email"} ·{" "}
                  {new Date(row.created_at).toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface p-3 text-sm">
                  {row.body}
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`note-${row.id}`}>Internal note</Label>
                    <Textarea
                      id={`note-${row.id}`}
                      rows={3}
                      value={values.note}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...values, note: event.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`res-${row.id}`}>Resolution shown to the member</Label>
                    <Textarea
                      id={`res-${row.id}`}
                      rows={3}
                      value={values.resolution}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...values, resolution: event.target.value },
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {STATES.filter((state) => state !== row.state).map((state) => (
                    <Button
                      key={state}
                      size="sm"
                      variant={state === "resolved" ? "default" : "outline"}
                      disabled={update.isPending}
                      onClick={() => void apply(row.id, state, values)}
                    >
                      Mark {state}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
