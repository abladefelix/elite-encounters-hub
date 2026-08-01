import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  Check,
  CheckCheck,
  Flag,
  Gift as GiftIcon,
  Image as ImageIcon,
  Lock,
  Paperclip,
  Phone,
  Plus,
  ShieldAlert,
  Send,
  ShieldCheck,
  Star,
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
import { GiftDialog, type GiftDraft } from "@/components/chat/gift-dialog";
import { CURRENT_CLIENT_ID, currentClient, getSpecialist, threads } from "@/lib/mock-data";
import { paystackChannel } from "@/lib/paystack";
import { ReportDialog, type ReportDraft } from "@/components/chat/report-dialog";
import { RatingDialog, type RatingDraft } from "@/components/chat/rating-dialog";
import {
  REPORT_REASON_LABEL,
  fileReport,
  saveRating,
  useRatings,
} from "@/lib/reports";

import { useRoomSettings } from "@/lib/room-settings";
import { logModerationHit, moderateMessage } from "@/lib/moderation";
import {
  ESCROW_STATE_LABEL,
  relativeTime,
  useEscrow,
  type EscrowEntry,
} from "@/lib/escrow";
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
  const [giftOpen, setGiftOpen] = useState(false);
  const [showListOnMobile, setShowListOnMobile] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { canCall, can, platform, giftsFor, moderation } = useRoomSettings();
  const member = currentClient();
  const { threadList, messages, typing, send, systemNote, bookingNote, giftNote } =
    useChat(activeThreadId);
  const {
    settings: escrow,
    open: openEscrow,
    entries: escrowEntries,
    confirmComplete,
    raiseIssue,
  } = useEscrow();

  const activeThread = threadList.find((thread) => thread.id === activeThreadId) ?? threadList[0]!;
  const specialist = getSpecialist(activeThread.specialistId)!;

  const roomGifts = giftsFor(member.room);
  const giftsAllowed = escrow.tipsEnabled && roomGifts.length > 0;
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

    const verdict = moderateMessage(body, moderation, member.room);

    if (verdict.findings.length && moderation.logHits) {
      logModerationHit({
        threadId: activeThread.id,
        threadLabel: specialist.name,
        room: member.room,
        authorId: CURRENT_CLIENT_ID,
        excerpt: body.slice(0, 180),
        kinds: [...new Set(verdict.findings.map((finding) => finding.kind))],
        matches: verdict.findings.map((finding) => finding.match),
        action: verdict.action,
      });
    }

    if (verdict.action === "block") {
      toast.error("Message not sent — house rules", {
        description: verdict.contact.length
          ? "Ashnight keeps contact details on-platform so every visit stays inside escrow."
          : `Blocked for ${verdict.reason ?? "flagged wording"}.`,
      });
      if (moderation.notifyMember) {
        systemNote(
          activeThread.id,
          `A message was blocked by Ashnight moderation — ${verdict.reason ?? "house rules"}.`,
        );
      }
      return;
    }

    if (verdict.action === "mask") {
      toast("Some text was redacted", {
        description: verdict.contact.length
          ? "Phone numbers, emails and links are hidden — keep the deal in-thread."
          : `Redacted ${verdict.reason ?? "flagged wording"}.`,
      });
    } else if (verdict.findings.length) {
      toast.warning("Heads up — this was flagged for review", {
        description: `Ashnight trust & safety was notified about ${verdict.reason ?? "this message"}.`,
      });
    }

    send(activeThread.id, verdict.body);
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
    const entry = openEscrow({
      kind: "booking",
      threadId: activeThread.id,
      specialistId: specialist.id,
      specialistName: specialist.name,
      label: `${request.service} · ${request.hours}h`,
      gross: request.total,
      feePct: platform.platformFeePct,
      reference: request.reference,
    });

    bookingNote(
      activeThread.id,
      `${request.service} · ${request.hours}h · ${request.scheduledFor}${
        request.addons.length ? ` · Add-ons: ${request.addons.join(", ")}` : ""
      } · ${money(request.total)} paid via Paystack (${
        paystackChannel(request.channel).label
      } · ${request.reference})`,
      entry.id,
    );
    toast.success(`${money(request.total)} secured in Ashnight escrow`, {
      description: escrow.escrowEnabled
        ? escrow.requireClientConfirm
          ? `${specialist.name.split(" ")[0]} is paid ${escrow.holdHours}h after you confirm the visit — unless you raise an issue.`
          : `Deposits automatically ${escrow.holdHours}h from now if no issue is raised.`
        : "Escrow is currently switched off, so the specialist is paid immediately.",
    });
  }

  function handleGift(gift: GiftDraft) {
    const entry = openEscrow({
      kind: "tip",
      threadId: activeThread.id,
      specialistId: specialist.id,
      specialistName: specialist.name,
      label: `${gift.glyph} ${gift.giftLabel}`,
      gross: gift.amount,
      feePct: escrow.tipFeePct,
      reference: gift.reference,
    });

    giftNote(
      activeThread.id,
      `${gift.glyph} ${gift.giftLabel} · ${money(gift.amount)} gift sent via Paystack (${
        paystackChannel(gift.channel).label
      } · ${gift.reference}) — ${specialist.name.split(" ")[0]} receives ${money(gift.net)}`,
      entry.id,
    );
    toast.success(`${gift.giftLabel} sent — ${money(gift.amount)}`, {
      description: escrow.tipsEscrowed
        ? `Held in escrow, deposits in ${escrow.holdHours}h.`
        : `${money(gift.net)} on its way to ${specialist.name.split(" ")[0]}.`,
    });
  }

  function openGift() {
    if (!escrow.tipsEnabled) {
      toast("Cash gifts are switched off by Ashnight right now.");
      return;
    }
    if (!giftsAllowed) {
      toast(`Cash gifts aren't included in the ${TIER_LABEL[member.room]} room`, {
        description: "Upgrade your room or ask support to enable gifting.",
      });
      return;
    }
    setGiftOpen(true);
  }

  function openRequest() {
    if (!platform.bookingsEnabled) {
      toast("Booking requests are paused by Ashnight right now.");
      return;
    }
    setRequestOpen(true);
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen">
        <SiteHeader />

        <div className="mx-auto w-full max-w-6xl px-0 py-0 sm:px-5 sm:py-8">
          <Card className="overflow-hidden border-border/70 bg-surface p-0">
            <div className="grid h-[calc(100svh-7rem)] sm:h-[76vh] md:grid-cols-[300px_1fr]">
              {/* thread list */}
              <aside
                className={cn(
                  "min-h-0 flex-col border-r border-border/70 bg-background/40 md:flex",
                  showListOnMobile ? "flex" : "hidden",
                )}
              >
                <div className="border-b border-border/70 p-4">
                  <h1 className="font-display text-base font-semibold">Messages</h1>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {threadList.length} active conversations · {TIER_LABEL[member.room]} room
                  </p>
                </div>
                <ScrollArea className="min-h-0 flex-1">
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
                  "flex min-h-0 min-w-0 flex-col",
                  showListOnMobile ? "hidden md:flex" : "flex",
                )}
              >
                <header className="flex shrink-0 items-center gap-3 border-b border-border/70 p-4">
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

                <ScrollArea className="min-h-0 flex-1">
                  <div className="space-y-4 p-4 sm:p-6">
                    {messages.map((message) => (
                      <MessageRow
                        key={message.id}
                        message={message}
                        name={specialist.name}
                        escrow={
                          message.escrowId
                            ? escrowEntries.find((entry) => entry.id === message.escrowId)
                            : undefined
                        }
                        onConfirm={confirmComplete}
                        onDispute={raiseIssue}
                      />
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

                <div className="shrink-0 border-t border-border/70 p-3 sm:p-4">
                  <Button
                    variant="brass"
                    className="w-full"
                    onClick={openRequest}
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="soft"
                          size="icon"
                          aria-label="Request service & pay with Paystack"
                          onClick={openRequest}
                        >
                          {platform.bookingsEnabled ? (
                            <Banknote className="size-4" />
                          ) : (
                            <Lock className="size-4 opacity-60" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {platform.bookingsEnabled
                          ? "Request service & pay with Paystack"
                          : "Booking requests are paused"}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Send a cash gift"
                          onClick={openGift}
                        >
                          {giftsAllowed ? (
                            <GiftIcon className="size-4" />
                          ) : (
                            <Lock className="size-4 opacity-60" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {giftsAllowed
                          ? `Send a cash gift (${roomGifts.length} available in your room)`
                          : escrow.tipsEnabled
                            ? `Cash gifts aren't included in the ${TIER_LABEL[member.room]} room`
                            : "Cash gifts are switched off"}
                      </TooltipContent>
                    </Tooltip>
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

        <GiftDialog
          specialist={specialist}
          room={member.room}
          open={giftOpen}
          onOpenChange={setGiftOpen}
          onConfirm={handleGift}
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

function MessageRow({
  message,
  name,
  escrow,
  onConfirm,
  onDispute,
}: {
  message: LiveMessage;
  name: string;
  escrow?: EscrowEntry | undefined;
  onConfirm: (id: string) => void;
  onDispute: (id: string, reason: string) => void;
}) {
  if (message.kind === "system") {
    return (
      <p className="mx-auto flex max-w-md items-center gap-2 rounded-full border border-border bg-background/60 px-4 py-2 text-center text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0 text-accent" />
        {message.body}
      </p>
    );
  }

  const mine = message.authorId === CURRENT_CLIENT_ID;
  const firstName = name.split(" ")[0];

  if (message.kind === "gift") {
    return (
      <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
        <div className="max-w-sm rounded-xl border border-accent/40 bg-accent/10 p-4">
          <p className="eyebrow text-accent">Cash gift sent</p>
          <p className="mt-2 text-sm leading-relaxed">{message.body}</p>
          {escrow ? <EscrowStrip entry={escrow} /> : null}
        </div>
      </div>
    );
  }

  if (message.kind === "booking") {
    return (
      <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
        <div className="max-w-sm rounded-xl border border-primary/30 bg-primary/10 p-4">
          <p className="eyebrow text-primary">Service requested · funds in escrow</p>
          <p className="mt-2 text-sm leading-relaxed">{message.body}</p>

          {escrow ? (
            <>
              <EscrowStrip entry={escrow} />
              {escrow.state === "held" || escrow.state === "clearing" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {escrow.state === "held" ? (
                    <Button size="sm" variant="brass" onClick={() => onConfirm(escrow.id)}>
                      <CheckCheck className="size-3.5" /> Visit complete
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="soft"
                    onClick={() =>
                      onDispute(escrow.id, "Member raised an issue from the chat thread.")
                    }
                  >
                    <ShieldAlert className="size-3.5" /> Raise an issue
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CheckCheck className="size-3.5" /> Awaiting confirmation from {firstName}
            </p>
          )}
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

/** Live escrow status for a booking or gift, as the member sees it. */
function EscrowStrip({ entry }: { entry: EscrowEntry }) {
  const detail =
    entry.state === "clearing"
      ? `Auto-deposit ${relativeTime(entry.clearingAt)}`
      : entry.state === "released"
        ? `Deposited ${relativeTime(entry.releasedAt)}`
        : entry.state === "disputed"
          ? "Frozen while Ashnight reviews"
          : entry.state === "refunded"
            ? "Refunded to your payment method"
            : "Waiting for you to confirm the visit";

  return (
    <div className="mt-3 rounded-lg border border-border/70 bg-background/60 p-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium">
        <ShieldCheck className="size-3.5 shrink-0 text-accent" />
        {ESCROW_STATE_LABEL[entry.state]}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {detail} · {money(entry.net)} to the specialist · ref {entry.reference}
      </p>
    </div>
  );
}
