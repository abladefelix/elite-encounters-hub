import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Banknote,
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

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { ReportDialog, type ReportDraft } from "@/components/chat/report-dialog";
import { RatingDialog, type RatingDraft } from "@/components/chat/rating-dialog";
import { REPORT_REASON_LABEL } from "@/lib/reports";
import { paystackChannel } from "@/lib/paystack";
import { useAuth } from "@/hooks/use-auth";
import {
  markThreadRead,
  uploadAttachment,
  useCreateBooking,
  useLogModerationHit,
  useMessages,
  useProfilesByIds,
  useRatings,
  useReportMutations,
  useSendMessage,
  useSubmitRating,
  useThreads,
  type MessageRow as MessageRowType,
  type ProfileRow,
  type ThreadRow,
} from "@/lib/queries";
import { useRoomSettings } from "@/lib/room-settings";
import { useFeatureFlags } from "@/lib/feature-flags";
import { moderateMessage } from "@/lib/moderation";
import {
  ESCROW_STATE_LABEL,
  relativeTime,
  useEscrow,
  type EscrowEntry,
} from "@/lib/escrow";
import { TIER_LABEL, initials, money, type Tier } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/messages")({
  head: () => ({
    meta: [
      { title: "Messages — Chat, Call & Book | Ashnight" },
      {
        name: "description",
        content:
          "Message vetted Ashnight ash specialists, start a voice or video walkthrough, and turn the conversation into a paid booking without leaving the thread.",
      },
      { property: "og:title", content: "Messages — Chat, Call & Book on Ashnight" },
      {
        property: "og:description",
        content:
          "Scope the job in chat, hop on a video walkthrough, then request and pay for the clean in the same thread.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MessagesPage,
});

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function MessagesPage() {
  const { loading, user, profile } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <p className="p-8 text-sm text-muted-foreground">Loading your conversations…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-md px-5 py-16 text-center">
          <h1 className="font-display text-xl font-semibold">Sign in to open your threads</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ashnight conversations, calls and escrow payments are only visible to vetted members.
          </p>
          <Button asChild variant="brass" className="mt-6">
            <Link to="/auth">Sign in to Ashnight</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <MessagesInbox userId={user.id} profile={profile} />;
}

function MessagesInbox({ userId, profile }: { userId: string; profile: ProfileRow | null }) {
  const [activeThreadId, setActiveThreadId] = useState("");
  const [draft, setDraft] = useState("");
  const [call, setCall] = useState<CallMode | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [showListOnMobile, setShowListOnMobile] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const { canCall, can, platform, giftsFor, moderation } = useRoomSettings();
  const { flags } = useFeatureFlags();
  const threadsQuery = useThreads(userId);
  const threadList = useMemo(() => threadsQuery.data ?? [], [threadsQuery.data]);

  const activeThread: ThreadRow | undefined =
    threadList.find((thread) => thread.id === activeThreadId) ?? threadList[0];

  const counterpartIds = threadList.map((thread) =>
    thread.client_id === userId ? thread.specialist_id : thread.client_id,
  );
  const peopleQuery = useProfilesByIds(counterpartIds);
  const peopleById = useMemo(() => {
    const map = new Map<string, ProfileRow>();
    for (const person of peopleQuery.data ?? []) map.set(person.id, person);
    return map;
  }, [peopleQuery.data]);

  const messagesQuery = useMessages(activeThread?.id);
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const sendMessage = useSendMessage();
  const createBooking = useCreateBooking();
  const logHit = useLogModerationHit();
  const reports = useReportMutations();
  const submitRating = useSubmitRating();
  const {
    settings: escrow,
    open: openEscrow,
    threadEntries,
    confirmComplete,
    raiseIssue,
  } = useEscrow();

  const iAmClient = activeThread ? activeThread.client_id === userId : true;
  const peerId = activeThread
    ? iAmClient
      ? activeThread.specialist_id
      : activeThread.client_id
    : undefined;
  const peer = peerId ? peopleById.get(peerId) : undefined;
  const peerName = peer?.display_name ?? "Ashnight member";
  const firstName = peerName.split(" ")[0] ?? peerName;
  const room: Tier = activeThread?.room ?? profile?.room ?? "basic";

  const ratingsQuery = useRatings(peerId);
  const myRating = useMemo(() => {
    const mine = (ratingsQuery.data ?? []).filter((rating) => rating.rater_id === userId);
    if (!mine.length) return null;
    return mine.reduce((sum, rating) => sum + rating.stars, 0) / mine.length;
  }, [ratingsQuery.data, userId]);

  const escrowEntries = activeThread ? threadEntries(activeThread.id) : [];
  const roomGifts = giftsFor(room);
  const giftsAllowed =
    flags.giftsEnabled && escrow.tipsEnabled && roomGifts.length > 0 && iAmClient;
  const audioAllowed = flags.callsEnabled && canCall(room, "audio");
  const videoAllowed = flags.callsEnabled && canCall(room, "video");
  const photosAllowed =
    flags.attachmentsEnabled && flags.chatImageSharing && can(room, "photoSharing");
  const filesAllowed = flags.attachmentsEnabled && can(room, "fileSharing");
  const bookingsOpen = flags.bookingsEnabled && platform.bookingsEnabled;

  useEffect(() => {
    if (!activeThread) return;
    void markThreadRead(activeThread.id, iAmClient ? "client" : "specialist");
  }, [activeThread?.id, iAmClient, activeThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  async function post(
    input: Partial<Omit<MessageRowType, "id" | "created_at" | "thread_id">> & { body: string },
  ) {
    if (!activeThread) return null;
    return sendMessage.mutateAsync({
      thread_id: activeThread.id,
      author_id: input.kind === "system" ? null : userId,
      kind: input.kind ?? "text",
      body: input.body,
      escrow_id: input.escrow_id ?? null,
      booking_id: input.booking_id ?? null,
      attachment_url: input.attachment_url ?? null,
      attachment_name: input.attachment_name ?? null,
      redacted: input.redacted ?? false,
    });
  }

  function systemNote(body: string) {
    void post({ kind: "system", body }).catch(() => undefined);
  }

  async function submit() {
    const body = draft.trim();
    if (!body || !activeThread) return;

    const verdict = moderateMessage(body, moderation, room);

    if (verdict.findings.length && moderation.logHits) {
      logHit.mutate({
        thread_id: activeThread.id,
        author_id: userId,
        original_body: body.slice(0, 500),
        categories: [...new Set(verdict.findings.map((finding) => finding.kind))],
        terms: verdict.findings.map((finding) => finding.match),
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
        systemNote(`A message was blocked by Ashnight moderation — ${verdict.reason ?? "house rules"}.`);
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
      toast.warning("Heads up — this was flagged for review");
    }

    setDraft("");
    try {
      await post({ body: verdict.body, redacted: verdict.action === "mask" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Message could not be sent");
    }
  }

  async function attach(file: File | undefined, kindLabel: "file" | "photo") {
    if (!file || !activeThread) return;
    const allowed = kindLabel === "photo" ? photosAllowed : filesAllowed;
    if (!allowed) {
      toast(`${kindLabel === "photo" ? "Photo" : "File"} sharing isn't included in the ${TIER_LABEL[room]} room`);
      return;
    }
    try {
      const url = await uploadAttachment(activeThread.id, file);
      await post({ body: file.name, attachment_url: url, attachment_name: file.name });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    }
  }

  function startCall(mode: CallMode) {
    const allowed = mode === "video" ? videoAllowed : audioAllowed;
    if (!allowed) {
      toast.error(
        `${mode === "video" ? "Video" : "Voice"} calls are switched off for the ${TIER_LABEL[room]} room`,
        { description: "Upgrade your room or ask support to enable it." },
      );
      return;
    }
    setCall(mode);
    systemNote(`${mode === "video" ? "Video" : "Voice"} call started — Ashnight never records calls.`);
  }

  async function handleBooking(request: ServiceRequestDraft) {
    if (!activeThread || !peerId) return;
    try {
      const booking = await createBooking.mutateAsync({
        thread_id: activeThread.id,
        client_id: userId,
        specialist_id: peerId,
        service_id: request.serviceId,
        service_name: request.service,
        hours: request.hours,
        addons: request.addons,
        rate: request.rate,
        platform_fee_pct: platform.platformFeePct,
        scheduled_for: request.scheduledFor || null,
        notes: request.notes,
        status: "requested",
      });

      const entry = await openEscrow({
        kind: "booking",
        threadId: activeThread.id,
        bookingId: booking.id,
        specialistId: peerId,
        label: `${request.service} · ${request.hours}h`,
        amount: request.total,
        feePct: platform.platformFeePct,
        paystackReference: request.reference,
      });

      await post({
        kind: "booking",
        escrow_id: entry.id,
        booking_id: booking.id,
        body: `${request.service} · ${request.hours}h${
          request.scheduledFor ? ` · ${request.scheduledFor}` : ""
        }${request.addons.length ? ` · Add-ons: ${request.addons.join(", ")}` : ""} · ${money(
          request.total,
        )} via Paystack (${paystackChannel(request.channel).label} · ${request.reference})`,
      });

      toast.success(`${money(request.total)} booking opened in Ashnight escrow`, {
        description:
          "Funds stay pending until Paystack confirms the charge, then the hold window starts.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Booking could not be created");
    }
  }

  async function handleGift(gift: GiftDraft) {
    if (!activeThread || !peerId) return;
    try {
      const entry = await openEscrow({
        kind: "gift",
        threadId: activeThread.id,
        specialistId: peerId,
        label: `${gift.glyph} ${gift.giftLabel}`,
        amount: gift.amount,
        feePct: escrow.tipFeePct,
        giftKey: gift.giftId,
        paystackReference: gift.reference,
      });

      await post({
        kind: "gift",
        escrow_id: entry.id,
        body: `${gift.glyph} ${gift.giftLabel} · ${money(gift.amount)} gift via Paystack (${
          paystackChannel(gift.channel).label
        } · ${gift.reference}) — ${firstName} receives ${money(gift.net)}`,
      });

      toast.success(`${gift.giftLabel} sent — ${money(gift.amount)}`, {
        description: "Confirmed once Paystack settles the charge.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gift could not be sent");
    }
  }

  function handleReport(reportDraft: ReportDraft) {
    if (!activeThread || !peerId) return;
    reports.create.mutate(
      {
        thread_id: activeThread.id,
        reporter_id: userId,
        reported_id: peerId,
        reason: reportDraft.reason,
        notes: reportDraft.details,
        blocked: reportDraft.blocked,
        excerpt: messages
          .slice(-4)
          .map((message) => message.body)
          .join(" | ")
          .slice(0, 300),
      },
      {
        onSuccess: () => {
          systemNote(
            `You reported this conversation to Ashnight trust & safety — ${
              REPORT_REASON_LABEL[reportDraft.reason]
            }.${reportDraft.blocked ? " The member is blocked while we review." : ""}`,
          );
          toast.success("Report sent to Ashnight trust & safety");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  function handleRating(ratingDraft: RatingDraft) {
    if (!activeThread || !peerId) return;
    submitRating.mutate(
      {
        thread_id: activeThread.id,
        rater_id: userId,
        rated_id: peerId,
        stars: ratingDraft.stars,
        note: ratingDraft.note,
        tags: ratingDraft.tags,
      },
      {
        onSuccess: () => {
          systemNote(
            `You rated ${firstName} ${ratingDraft.stars}/5${
              ratingDraft.tags.length ? ` · ${ratingDraft.tags.join(", ")}` : ""
            }`,
          );
          toast.success(`${ratingDraft.stars}-star rating posted`);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  function openGift() {
    if (!escrow.tipsEnabled) {
      toast("Cash gifts are switched off by Ashnight right now.");
      return;
    }
    if (!giftsAllowed) {
      toast(`Cash gifts aren't included in the ${TIER_LABEL[room]} room`);
      return;
    }
    setGiftOpen(true);
  }

  function openRequest() {
    if (!bookingsOpen) {
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
                    {threadList.length} conversations · {TIER_LABEL[room]} room
                  </p>
                </div>
                <ScrollArea className="min-h-0 flex-1">
                  {threadsQuery.isLoading ? (
                    <p className="p-4 text-xs text-muted-foreground">Loading threads…</p>
                  ) : null}
                  {threadList.map((item) => {
                    const otherId = item.client_id === userId ? item.specialist_id : item.client_id;
                    const other = peopleById.get(otherId);
                    const name = other?.display_name ?? "Ashnight member";
                    const unread =
                      new Date(item.last_message_at).getTime() >
                      new Date(
                        item.client_id === userId
                          ? item.client_last_read_at
                          : item.specialist_last_read_at,
                      ).getTime();
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveThreadId(item.id);
                          setShowListOnMobile(false);
                        }}
                        className={cn(
                          "flex w-full gap-3 border-b border-border/50 p-4 text-left transition-colors hover:bg-secondary/60",
                          item.id === activeThread?.id && "bg-secondary",
                        )}
                      >
                        <Avatar className="size-10 border border-border">
                          {other?.avatar_url ? <AvatarImage src={other.avatar_url} alt={name} /> : null}
                          <AvatarFallback className="bg-surface-strong text-xs">
                            {initials(name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold">{name}</p>
                            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                              {timeLabel(item.last_message_at)}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {item.last_message || "No messages yet"}
                          </p>
                        </div>
                        {unread ? (
                          <Badge className="h-5 min-w-5 justify-center rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                            •
                          </Badge>
                        ) : null}
                      </button>
                    );
                  })}
                  {!threadsQuery.isLoading && !threadList.length ? (
                    <p className="p-4 text-xs text-muted-foreground">
                      No conversations yet. Open one from a specialist profile.
                    </p>
                  ) : null}
                </ScrollArea>
              </aside>

              {/* conversation */}
              <section
                className={cn(
                  "flex min-h-0 min-w-0 flex-col",
                  showListOnMobile ? "hidden md:flex" : "flex",
                )}
              >
                {!activeThread ? (
                  <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
                    Pick a conversation to start scoping a visit.
                  </div>
                ) : (
                  <>
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
                        {peer?.avatar_url ? <AvatarImage src={peer.avatar_url} alt={peerName} /> : null}
                        <AvatarFallback className="bg-surface-strong text-xs">
                          {initials(peerName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold">{peerName}</p>
                          {peer?.room ? (
                            <TierBadge tier={peer.room} className="hidden sm:inline-flex" />
                          ) : null}
                        </div>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          {peer?.available ? "Available now" : `Replies in ~${peer?.response_minutes ?? 30}m`}
                          {myRating ? (
                            <span className="flex items-center gap-1 text-primary">
                              · <Star className="size-3 fill-primary" /> {myRating.toFixed(1)} from you
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <div className="ml-auto flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Rate ${peerName}`}
                              onClick={() => setRatingOpen(true)}
                            >
                              <Star className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Rate this member</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Report ${peerName}`}
                              onClick={() => setReportOpen(true)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Flag className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Report this member to trust &amp; safety</TooltipContent>
                        </Tooltip>
                        <CallControl
                          allowed={audioAllowed}
                          label="voice"
                          room={TIER_LABEL[room]}
                          onClick={() => startCall("audio")}
                        >
                          <Phone className="size-4" />
                        </CallControl>
                        <CallControl
                          allowed={videoAllowed}
                          label="video"
                          room={TIER_LABEL[room]}
                          onClick={() => startCall("video")}
                        >
                          <Video className="size-4" />
                        </CallControl>
                      </div>
                    </header>

                    {!audioAllowed && !videoAllowed ? (
                      <p className="flex items-center gap-2 border-b border-border/70 bg-background/50 px-4 py-2 text-[11px] text-muted-foreground">
                        <Lock className="size-3.5 shrink-0" />
                        Calling is disabled for the {TIER_LABEL[room]} room. Chat and booking stay open.
                      </p>
                    ) : null}

                    <ScrollArea className="min-h-0 flex-1">
                      <div className="space-y-4 p-4 sm:p-6">
                        {messages.map((message) => (
                          <MessageBubble
                            key={message.id}
                            message={message}
                            mine={message.author_id === userId}
                            peerFirstName={firstName}
                            escrow={
                              message.escrow_id
                                ? escrowEntries.find((entry) => entry.id === message.escrow_id)
                                : undefined
                            }
                            canResolve={iAmClient}
                            onConfirm={(id) => void confirmComplete(id)}
                            onDispute={(id, reason) => void raiseIssue(id, reason)}
                          />
                        ))}
                        <div ref={bottomRef} />
                      </div>
                    </ScrollArea>

                    <div className="shrink-0 border-t border-border/70 p-3 sm:p-4">
                      {iAmClient ? (
                        <Button variant="brass" className="w-full" onClick={openRequest}>
                          {bookingsOpen ? (
                            <>
                              <Plus className="size-4" /> Request service &amp; pay
                            </>
                          ) : (
                            <>
                              <Lock className="size-4" /> Booking requests paused
                            </>
                          )}
                        </Button>
                      ) : null}

                      <form
                        className="mt-3 flex items-center gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void submit();
                        }}
                      >
                        {iAmClient ? (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="soft"
                                  size="icon"
                                  aria-label="Request service & pay with Paystack"
                                  onClick={openRequest}
                                >
                                  {bookingsOpen ? (
                                    <Banknote className="size-4" />
                                  ) : (
                                    <Lock className="size-4 opacity-60" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {bookingsOpen
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
                                  : "Cash gifts are unavailable here"}
                              </TooltipContent>
                            </Tooltip>
                          </>
                        ) : null}

                        <input
                          ref={fileRef}
                          type="file"
                          className="hidden"
                          onChange={(event) => {
                            void attach(event.target.files?.[0], "file");
                            event.target.value = "";
                          }}
                        />
                        <input
                          ref={photoRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => {
                            void attach(event.target.files?.[0], "photo");
                            event.target.value = "";
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Attach file"
                          onClick={() =>
                            filesAllowed
                              ? fileRef.current?.click()
                              : toast(`File sharing isn't included in the ${TIER_LABEL[room]} room`)
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
                            photosAllowed
                              ? photoRef.current?.click()
                              : toast(`Photo sharing isn't included in the ${TIER_LABEL[room]} room`)
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
                          placeholder={`Message ${firstName}…`}
                          maxLength={1000}
                        />
                        <Button
                          type="submit"
                          size="icon"
                          variant="soft"
                          disabled={!draft.trim() || sendMessage.isPending}
                          aria-label="Send message"
                        >
                          <Send className="size-4" />
                        </Button>
                      </form>
                    </div>
                  </>
                )}
              </section>
            </div>
          </Card>
        </div>

        {activeThread ? (
          <>
            <ServiceRequestDialog
              specialistName={peerName}
              hourlyRate={peer?.hourly_rate ?? 0}
              open={requestOpen}
              onOpenChange={setRequestOpen}
              onConfirm={(request) => void handleBooking(request)}
            />

            <GiftDialog
              specialistName={peerName}
              room={room}
              open={giftOpen}
              onOpenChange={setGiftOpen}
              onConfirm={(gift) => void handleGift(gift)}
            />

            <ReportDialog
              specialistName={peerName}
              open={reportOpen}
              onOpenChange={setReportOpen}
              onSubmit={handleReport}
            />

            <RatingDialog
              specialistName={peerName}
              open={ratingOpen}
              onOpenChange={setRatingOpen}
              onSubmit={handleRating}
            />

            {call ? (
              <CallOverlay
                threadId={activeThread.id}
                selfId={userId}
                isCaller
                peerName={peerName}
                mode={call}
                onEnd={() => {
                  setCall(null);
                  systemNote("Call ended.");
                }}
              />
            ) : null}
          </>
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
  children: ReactNode;
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

function MessageBubble({
  message,
  mine,
  peerFirstName,
  escrow,
  canResolve,
  onConfirm,
  onDispute,
}: {
  message: MessageRowType;
  mine: boolean;
  peerFirstName: string;
  escrow?: EscrowEntry | undefined;
  canResolve: boolean;
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

  if (message.kind === "gift") {
    return (
      <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
        <div className="max-w-sm rounded-xl border border-accent/40 bg-accent/10 p-4">
          <p className="eyebrow text-accent">Cash gift</p>
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
              {canResolve && (escrow.state === "held" || escrow.state === "clearing") ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {escrow.state === "held" ? (
                    <Button size="sm" variant="brass" onClick={() => onConfirm(escrow.id)}>
                      <CheckCheck className="size-3.5" /> Visit complete
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="soft"
                    onClick={() => onDispute(escrow.id, "Member raised an issue from the chat thread.")}
                  >
                    <ShieldAlert className="size-3.5" /> Raise an issue
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CheckCheck className="size-3.5" /> Awaiting confirmation from {peerFirstName}
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
          {message.attachment_url ? (
            /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(message.attachment_name ?? "") ||
            /image/i.test(message.attachment_name ?? "") ? (
              <a href={message.attachment_url} target="_blank" rel="noreferrer" className="block">
                <img
                  src={message.attachment_url}
                  alt={message.attachment_name ?? "Shared photo"}
                  loading="lazy"
                  className="max-h-64 w-full rounded-lg object-cover"
                />
              </a>
            ) : (
              <a
                href={message.attachment_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 underline"
              >
                <Paperclip className="size-3.5" />
                {message.attachment_name ?? "Attachment"}
              </a>
            )
          ) : (
            message.body
          )}
        </div>
        <p
          className={cn(
            "mt-1 flex items-center gap-1 text-[10px] text-muted-foreground",
            mine ? "justify-end" : "justify-start",
          )}
        >
          {timeLabel(message.created_at)}
          {message.redacted ? " · redacted" : ""}
        </p>
      </div>
    </div>
  );
}

/** Live escrow status for a booking or gift, as the member sees it. */
function EscrowStrip({ entry }: { entry: EscrowEntry }) {
  const detail =
    entry.state === "pending"
      ? "Waiting for Paystack to confirm the payment"
      : entry.state === "clearing"
        ? `Auto-deposit ${relativeTime(entry.release_at)}`
        : entry.state === "released"
          ? `Deposited ${relativeTime(entry.released_at)}`
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
        {detail} · {money(entry.payout_amount)} to the specialist
        {entry.paystack_reference ? ` · ref ${entry.paystack_reference}` : ""}
      </p>
    </div>
  );
}
