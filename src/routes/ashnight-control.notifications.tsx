import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Mail, MessageSquareText, Save, Send, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataPager, usePaged } from "@/components/ui/data-pager";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { sendNotification } from "@/lib/identity.functions";
import { DEFAULT_NOTIFICATION_SETTINGS, NOTIFICATION_EVENTS, type NotificationChannel, type NotificationSettings, useNotificationSettings } from "@/lib/notification-settings";
import { useAllNotifications, useDeleteNotification } from "@/lib/support";
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
  component: AdminNotifications,
});

type Audience = "everyone" | "clients" | "specialists" | "room" | "user";

function AdminNotifications() {
  const history = useAllNotifications();
  const paged = usePaged(history.data ?? [], 10);
  const deleteNotification = useDeleteNotification();
  const [audience, setAudience] = useState<Audience>("everyone");
  const [room, setRoom] = useState<Tier>("basic");
  const [userId, setUserId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const notificationSettings = useNotificationSettings();
  const [settingsDraft, setSettingsDraft] = useState<NotificationSettings | null>(null);
  const [channels, setChannels] = useState<NotificationChannel[]>(["inApp"]);
  const rules = settingsDraft ?? notificationSettings.value;

  function toggleChannel(channel: NotificationChannel, checked: boolean) {
    setChannels((current) => checked ? [...new Set([...current, channel])] : current.filter((item) => item !== channel));
  }

  function updateRule(event: keyof NotificationSettings["rules"], channel: NotificationChannel, checked: boolean) {
    setSettingsDraft((current) => {
      const base = current ?? notificationSettings.value;
      return { ...base, rules: { ...base.rules, [event]: { ...base.rules[event], [channel]: checked } } };
    });
  }

  async function send() {
    if (title.trim().length < 2) {
      toast.error("Give the announcement a title.");
      return;
    }
    if (audience === "user" && !userId.trim()) {
      toast.error("Paste the member's ID for a direct message.");
      return;
    }
    if (channels.length === 0) {
      toast.error("Select at least one delivery channel.");
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
          channels,
          ...(audience === "room" ? { room } : {}),
          ...(audience === "user" ? { userId: userId.trim() } : {}),
        },
      });
      if (result.channels.email === "not_configured" || result.channels.sms === "not_configured") {
        toast.warning(`In-app: ${result.sent}. Email or SMS was skipped because its delivery service is not configured.`);
      } else {
        toast.success(`Delivered to ${result.sent} inbox${result.sent === 1 ? "" : "es"}`);
      }
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
              <Label>Delivery channels</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                <ChannelChoice label="In-app" icon={MessageSquareText} checked={channels.includes("inApp")} available onChange={(checked) => toggleChannel("inApp", checked)} />
                <ChannelChoice label="Email" icon={Mail} checked={channels.includes("email")} available={false} onChange={(checked) => toggleChannel("email", checked)} />
                <ChannelChoice label="SMS" icon={Smartphone} checked={channels.includes("sms")} available={false} onChange={(checked) => toggleChannel("sms", checked)} />
              </div>
              <p className="text-xs text-muted-foreground">Email requires a verified sending domain. SMS requires a connected provider.</p>
            </div>

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
            <DataPager paged={paged} label="notifications" />
            {paged.rows.map((row) => (
              <div key={row.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{row.title}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto"
                    aria-label={`Delete notification ${row.title}`}
                    disabled={deleteNotification.isPending}
                    onClick={() => {
                      deleteNotification.mutate(row.id, {
                        onSuccess: () => toast("Notification deleted"),
                        onError: (error) =>
                          toast.error(
                            error instanceof Error ? error.message : "Could not delete notification",
                          ),
                      });
                    }}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
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

      <Card>
        <CardHeader>
          <CardTitle>Automatic notification rules</CardTitle>
          <CardDescription>Choose which channels each platform action should use. Unconfigured channels remain safely queued off.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="border-b bg-muted/40">
                <tr><th className="px-4 py-3 text-left font-medium">Action</th><th className="px-4 py-3 text-center font-medium">In-app</th><th className="px-4 py-3 text-center font-medium">Email</th><th className="px-4 py-3 text-center font-medium">SMS</th></tr>
              </thead>
              <tbody>{NOTIFICATION_EVENTS.map((event) => <tr key={event.key} className="border-b last:border-0"><td className="px-4 py-3"><p className="font-medium">{event.label}</p><p className="text-xs text-muted-foreground">{event.description}</p></td>{(["inApp", "email", "sms"] as const).map((channel) => <td key={channel} className="px-4 py-3 text-center"><Switch aria-label={`${event.label} via ${channel}`} checked={rules.rules[event.key]?.[channel] ?? DEFAULT_NOTIFICATION_SETTINGS.rules[event.key][channel]} onCheckedChange={(checked) => updateRule(event.key, channel, checked)} /></td>)}</tr>)}</tbody>
            </table>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><div className="space-y-2"><Label htmlFor="sms-sender">SMS sender name</Label><Input id="sms-sender" maxLength={11} value={rules.smsSender} onChange={(event) => setSettingsDraft({ ...rules, smsSender: event.target.value })} placeholder="Ashnight" /><p className="text-xs text-muted-foreground">Up to 11 letters where supported by the mobile network.</p></div><Button disabled={notificationSettings.loading} onClick={async () => { try { await notificationSettings.save(rules); setSettingsDraft(null); toast.success("Notification rules saved."); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save notification rules."); } }}><Save className="size-4" /> Save rules</Button></div>
        </CardContent>
      </Card>
    </div>
  );
}

function ChannelChoice({ label, icon: Icon, checked, available, onChange }: { label: string; icon: typeof Mail; checked: boolean; available: boolean; onChange: (checked: boolean) => void }) {
  return <div className="flex items-center gap-3 rounded-md border p-3"><Icon className="size-4 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="font-medium">{label}</p><p className="text-xs text-muted-foreground">{available ? "Ready" : "Setup required"}</p></div><Switch checked={checked} aria-label={`Send via ${label}`} onCheckedChange={onChange} /></div>;
}
