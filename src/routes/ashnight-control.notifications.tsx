import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Send } from "lucide-react";
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
import { sendNotification } from "@/lib/identity.functions";
import { useAllNotifications } from "@/lib/support";
import type { Tier } from "@/lib/types";

export const Route = createFileRoute("/ashnight-control/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications | Ashnight Admin" },
      {
        name: "description",
        content:
          "Broadcast announcements to everyone, a single room, clients, specialists or one member, and review everything already delivered.",
      },
      { property: "og:title", content: "Notifications | Ashnight Admin" },
      { property: "og:description", content: "Ashnight announcement console." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminNotifications;
});

type Audience = "everyone" | "clients" | "specialists" | "room" | "user";

function AdminNotifications() {
  const history = useAllNotifications();
  const [audience, setAudience] = useState<Audience>("everyone");
  const [room, setRoom] = useState<Tier>("basic");
  const [userId, setUserId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (title.trim().length < 2) {
      toast.error("Give the announcement a title.");
      return;
    }
    if (audience === "user" && !userId.trim()) {
      toast.error("Paste the member's ID for a direct message.");
      return;
    }
    setBusy(true);
    try {
      const result = await sendNotification({
        data: {
          title: title.trim(),
          body: body.trim(),
          link: link.trim(),
          audience,
          ...(audience === "room" ? { room } : {}),
          ...(audience === "user" ? { userId: userId.trim() } : {}),
        },
      });
      toast.success(`Delivered to ${result.sent} inbox${result.sent === 1 ? "" : "es"}`);
      setTitle("");
      setBody("");
      setLink("");
      await history.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Broadcast failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow text-primary">Comms</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Notifications
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Welcome messages, booking updates, payout and escrow notices are sent automatically. Use
          this console for anything manual.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>New announcement</CardTitle>
            <CardDescription>Lands in the member inbox instantly, in real time.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Audience</Label>
              <Select value={audience} onValueChange={(value) => setAudience(value as Audience)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="everyone">Everyone</SelectItem>
                  <SelectItem value="clients">Clients only</SelectItem>
                  <SelectItem value="specialists">Specialists only</SelectItem>
                  <SelectItem value="room">One room</SelectItem>
                  <SelectItem value="user">One member</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {audience === "room" ? (
              <div className="space-y-2">
                <Label>Room</Label>
                <Select value={room} onValueChange={(value) => setRoom(value as Tier)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                    <SelectItem value="ultimate">Ultimate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {audience === "user" ? (
              <div className="space-y-2">
                <Label htmlFor="notify-user">Member ID</Label>
                <Input
                  id="notify-user"
                  value={userId}
                  onChange={(event) => setUserId(event.target.value)}
                  placeholder="uuid from the members table"
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="notify-title">Title</Label>
              <Input
                id="notify-title"
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Escrow hold shortened to 24 hours"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notify-body">Message</Label>
              <Textarea
                id="notify-body"
                rows={5}
                maxLength={2000}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notify-link">Link (optional)</Label>
              <Input
                id="notify-link"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="/rooms"
              />
            </div>

            <Button onClick={() => void send()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Send announcement
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Delivered</CardTitle>
            <CardDescription>Last 300 notifications across the platform.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {history.isLoading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : null}
            {(history.data ?? []).map((row) => (
              <div key={row.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{row.title}</p>
                  <Badge variant="outline" className="text-[0.6rem] uppercase">
                    {row.kind}
                  </Badge>
                  {row.read_at ? (
                    <Badge variant="secondary" className="text-[0.6rem]">
                      read
                    </Badge>
                  ) : null}
                </div>
                {row.body ? (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.body}</p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(row.created_at).toLocaleString()}
                </p>
              </div>
            ))}
            {!history.isLoading && (history.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing has been sent yet.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
