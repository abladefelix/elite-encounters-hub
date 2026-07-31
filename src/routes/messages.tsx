import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Image as ImageIcon,
  Lock,
  Paperclip,
  Phone,
  Plus,
  Send,
  ShieldCheck,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SiteHeader } from "@/components/site-header";
import { TierBadge } from "@/components/tier-badge";
import { CallOverlay, type CallMode } from "@/components/chat/call-overlay";
import {
  ServiceRequestDialog,
  type ServiceRequestDraft,
} from "@/components/chat/service-request-dialog";
import { CURRENT_CLIENT_ID, currentClient, getSpecialist, threads } from "@/lib/mock-data";
import { useRoomSettings } from "@/lib/room-settings";
import { useChat, type LiveMessage } from "@/lib/use-chat";
import { TIER_LABEL, initials, money } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/messages")({
  head: () => ({
    meta: [
      { title: "Messages — Chat, Call & Book | Ashnight" },
      {
        name: "description",
        content:
          "Message vetted Ashnight cleaning specialists, start a voice or video walkthrough, and turn the conversation into a paid booking without leaving the thread.",
      },
      { property: "og:title", content: "Messages — Chat, Call & Book on Ashnight" },
      {
        property: "og:description",
        content:
          "Scope the job in chat, hop on a video walkthrough, then request and pay for the clean in the same thread.",
      },
    ],
  }),
  component: MessagesPage,
});

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function MessagesPage() {
  const [activeThreadId, setActiveThreadId] = useState(threads[0]?.id ?? "");
  const [draft, setDraft] = useState("");
  const [call, setCall] = useState<CallMode | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [showListOnMobile, setShowListOnMobile] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { canCall, can, platform } = useRoomSettings();
  const member = currentClient();
  const { threadList, messages, typing, send, systemNote, bookingNote } =
    useChat(activeThreadId);

  const activeThread = threadList.find((thread) => thread.id === activeThreadId) ?? threadList[0]!;
  const specialist = getSpecialist(activeThread.specialistId)!;

  const audioAllowed = canCall(member.room, "audio");
  const videoAllowed = canCall(member.room, "video");
  const photosAllowed = can(member.room, "photoSharing");
  const filesAllowed = can(member.room, "fileSharing");


  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, typing]);

  function submit() {
    const body = draft.trim();
    if (!body) return;
    send(activeThread.id, body);
    setDraft("");
  }

  function startCall(mode: CallMode) {
    const allowed = mode === "video" ? videoAllowed : audioAllowed;
    if (!allowed) {
      toast.error(
        `${mode === "video" ? "Video" : "Voice"} calls are switched off for the ${
          TIER_LABEL[member.room]
        } room`,
        { description: "Upgrade your room or ask support to enable it." },
      );
      return;
    }
    setCall(mode);
    systemNote(
      activeThread.id,
      `${mode === "video" ? "Video" : "Voice"} call started — Ashnight never records calls.`,
    );
  }

  function handleBooking(request: ServiceRequestDraft) {
    bookingNote(
      activeThread.id,
      `${request.service} · ${request.hours}h · ${request.scheduledFor}${
        request.addons.length ? ` · Add-ons: ${request.addons.join(", ")}` : ""
      } · ${money(request.total)} held`,
    );
    toast.success(`Payment held — ${specialist.name.split(" ")[0]} has 12h to confirm`);
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen">
        <SiteHeader />

        <div className="mx-auto w-full max-w-6xl px-0 py-0 sm:px-5 sm:py-8">
          <Card className="overflow-hidden border-border/70 bg-surface p-0">
            <div className="grid h-[calc(100svh-4rem)] sm:h-[76vh] md:grid-cols-[300px_1fr]">
              {/* thread list */}
              <aside
                className={cn(
                  "flex-col border-r border-border/70 bg-background/40 md:flex",
                  showListOnMobile ? "flex" : "hidden",
                )}
              >
                <div className="border-b border-border/70 p-4">
                  <h1 className="font-display text-base font-semibold">Messages</h1>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {threadList.length} active conversations · {TIER_LABEL[member.room]} room
                  </p>
                </div>
                <ScrollArea className="flex-1">
                  {threadList.map((item) => {
                    const active = item.id === activeThread.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveThreadId(item.id);
                          setShowListOnMobile(false);
                        }}
                        className={cn(
                          "flex w-full gap-3 border-b border-border/50 p-4 text-left transition-colors hover:bg-secondary/60",
                          active && "bg-secondary",
                        )}
                      >
                        <div className="relative">
                          <Avatar className="size-10 border border-border">
                            <AvatarFallback className="bg-surface-strong text-xs">
                              {initials(item.specialist.name)}
                            </AvatarFallback>
                          </Avatar>
                          {item.specialist.online ? (
                            <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-background bg-success" />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold">
                              {item.specialist.name}
                            </p>
                            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                              {timeLabel(item.lastAt)}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {item.lastMessage}
                          </p>
                        </div>
                        {item.unread ? (
                          <Badge className="h-5 min-w-5 justify-center rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                            {item.unread}
                          </Badge>
                        ) : null}
                      </button>
                    );
                  })}
                </ScrollArea>
              </aside>

              {/* conversation */}
              <section
                className={cn(
                  "flex min-w-0 flex-col",
                  showListOnMobile ? "hidden md:flex" : "flex",
                )}
              >
                <header className="flex items-center gap-3 border-b border-border/70 p-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    onClick={() => setShowListOnMobile(true)}
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                  <Avatar className="size-10 border border-border">
                    <AvatarFallback className="bg-surface-strong text-xs">
                      {initials(specialist.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">{specialist.name}</p>
                      <TierBadge tier={specialist.room} className="hidden sm:inline-flex" />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {typing
                        ? "Typing…"
                        : specialist.online
                          ? "Online now"
                          : `Replies in ~${specialist.responseMinutes}m`}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <CallControl
                      allowed={audioAllowed}
                      label="voice"
                      room={TIER_LABEL[member.room]}
                      onClick={() => startCall("audio")}
                    >
                      <Phone className="size-4" />
                    </CallControl>
                    <CallControl
                      allowed={videoAllowed}
                      label="video"
                      room={TIER_LABEL[member.room]}
                      onClick={() => startCall("video")}
                    >
                      <Video className="size-4" />
                    </CallControl>
                  </div>
                </header>

                {!audioAllowed && !videoAllowed ? (
                  <p className="flex items-center gap-2 border-b border-border/70 bg-background/50 px-4 py-2 text-[11px] text-muted-foreground">
                    <Lock className="size-3.5 shrink-0" />
                    Calling is disabled for the {TIER_LABEL[member.room]} room. Chat and booking
                    stay open.
                  </p>
                ) : null}

                <ScrollArea className="flex-1">
                  <div className="space-y-4 p-4 sm:p-6">
                    {messages.map((message) => (
                      <MessageRow key={message.id} message={message} name={specialist.name} />
                    ))}
                    {typing ? (
                      <div className="flex justify-start">
                        <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-surface-strong px-4 py-3">
                          {[0, 150, 300].map((delay) => (
                            <span
                              key={delay}
                              className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
                              style={{ animationDelay: `${delay}ms` }}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div ref={bottomRef} />
                  </div>
                </ScrollArea>

                <div className="border-t border-border/70 p-3 sm:p-4">
                  <Button
                    variant="brass"
                    className="w-full"
                    onClick={() => {
                      if (!platform.bookingsEnabled) {
                        toast("Booking requests are paused by Ashnight right now.");
                        return;
                      }
                      setRequestOpen(true);
                    }}
                  >
                    {platform.bookingsEnabled ? (
                      <>
                        <Plus className="size-4" /> Request service & pay
                      </>
                    ) : (
                      <>
                        <Lock className="size-4" /> Booking requests paused
                      </>
                    )}
                  </Button>

                  <form
                    className="mt-3 flex items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      submit();
                    }}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Attach file"
                      onClick={() =>
                        toast(
                          filesAllowed
                            ? "Attachments arrive with the storage backend"
                            : `File sharing isn't included in your ${member.room} room`,
                        )
                      }
                    >
                      {filesAllowed ? (
                        <Paperclip className="size-4" />
                      ) : (
                        <Lock className="size-4 opacity-60" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Send photo"
                      onClick={() =>
                        toast(
                          photosAllowed
                            ? "Photo sharing arrives with the storage backend"
                            : `Photo sharing isn't included in your ${member.room} room`,
                        )
                      }
                    >
                      {photosAllowed ? (
                        <ImageIcon className="size-4" />
                      ) : (
                        <Lock className="size-4 opacity-60" />
                      )}
                    </Button>

                    <Input
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder={`Message ${specialist.name.split(" ")[0]}…`}
                      maxLength={1000}
                    />
                    <Button
                      type="submit"
                      size="icon"
                      variant="soft"
                      disabled={!draft.trim()}
                      aria-label="Send message"
                    >
                      <Send className="size-4" />
                    </Button>
                  </form>
                </div>
              </section>
            </div>
          </Card>
        </div>

        <ServiceRequestDialog
          specialist={specialist}
          open={requestOpen}
          onOpenChange={setRequestOpen}
          onConfirm={handleBooking}
        />

        {call ? (
          <CallOverlay
            specialist={specialist}
            mode={call}
            onEnd={() => {
              setCall(null);
              systemNote(activeThread.id, "Call ended.");
            }}
          />
        ) : null}
      </div>
    </TooltipProvider>
  );
}

function CallControl({
  allowed,
  label,
  room,
  onClick,
  children,
}: {
  allowed: boolean;
  label: string;
  room: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClick}
          aria-label={`Start ${label} call`}
          className={cn(!allowed && "text-muted-foreground/50")}
        >
          {allowed ? children : <Lock className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {allowed ? `Start ${label} call` : `${label} calls are off for the ${room} room`}
      </TooltipContent>
    </Tooltip>
  );
}

function MessageRow({ message, name }: { message: LiveMessage; name: string }) {
  if (message.kind === "system") {
    return (
      <p className="mx-auto flex max-w-md items-center gap-2 rounded-full border border-border bg-background/60 px-4 py-2 text-center text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0 text-accent" />
        {message.body}
      </p>
    );
  }

  const mine = message.authorId === CURRENT_CLIENT_ID;

  if (message.kind === "booking") {
    return (
      <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
        <div className="max-w-sm rounded-xl border border-primary/30 bg-primary/10 p-4">
          <p className="eyebrow text-primary">Service requested · payment held</p>
          <p className="mt-2 text-sm leading-relaxed">{message.body}</p>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CheckCheck className="size-3.5" /> Awaiting confirmation from {name.split(" ")[0]}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className="max-w-[78%]">
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            mine
              ? "rounded-br-sm bg-primary text-primary-foreground"
              : "rounded-bl-sm bg-surface-strong text-foreground",
          )}
        >
          {message.body}
        </div>
        <p
          className={cn(
            "mt-1 flex items-center gap-1 text-[10px] text-muted-foreground",
            mine ? "justify-end" : "justify-start",
          )}
        >
          {timeLabel(message.at)}
          {mine && message.delivery ? (
            message.delivery === "read" ? (
              <CheckCheck className="size-3 text-accent" />
            ) : message.delivery === "sent" ? (
              <CheckCheck className="size-3" />
            ) : (
              <Check className="size-3" />
            )
          ) : null}
        </p>
      </div>
    </div>
  );
}
