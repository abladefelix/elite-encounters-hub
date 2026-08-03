import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Banknote,
  CheckCheck,
  Copy,
  Eraser,
  Flag,
  Gift as GiftIcon,
  Image as ImageIcon,
  Lock,
  Loader2,
  MapPin,
  MoreVertical,
  Paperclip,
  Phone,
  Plus,
  Search,
  ShieldAlert,
  Send,
  ShieldCheck,
  Star,
  Trash2,
  User as UserIcon,
  Video,
  X,
} from "lucide-react";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SiteHeader } from "@/components/site-header";
import { TierBadge } from "@/components/tier-badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CallOverlay, type CallMode } from "@/components/chat/call-overlay";
import { sendRing } from "@/lib/call-ring";
import { useIsOnline } from "@/lib/presence";
import { useTypingIndicator } from "@/lib/typing";
import {
  ServiceRequestDialog,
  type ServiceRequestDraft,
} from "@/components/chat/service-request-dialog";
import { QuoteDialog, type QuoteDraft } from "@/components/chat/quote-dialog";
import { GiftDialog, type GiftDraft } from "@/components/chat/gift-dialog";
import { ReportDialog, type ReportDraft } from "@/components/chat/report-dialog";
import { RatingDialog, type RatingDraft } from "@/components/chat/rating-dialog";
import { UploadProgressList } from "@/components/upload-progress-list";
import { useUploadQueue } from "@/hooks/use-upload-queue";
import { safeName, signAttachment } from "@/lib/upload-progress";
import { canReview } from "@/lib/ratings";
import { REPORT_REASON_LABEL } from "@/lib/reports";
import { paystackChannel } from "@/lib/paystack";
import {
  createSpecialistQuote,
  startBookingCheckout,
  startGiftCheckout,
} from "@/lib/payments.functions";
import { useAuth } from "@/hooks/use-auth";
import {
  clearThread,
  deleteOwnMessage,
  hideThread,
  restoreThreadHistory,
  unhideThread,
  markThreadRead,
  useBookings,
  useCreateBooking,
  useLogModerationHit,
  useMessages,
  useProfilesByIds,
  useRatings,
  useReportMutations,
  useSendMessage,
  useSubmitRating,
  useThreads,
  type BookingRow,
  type MessageRow as MessageRowType,
  type ProfileRow,
  type ThreadRow,
} from "@/lib/queries";
import { useRoomSettings } from "@/lib/room-settings";
import { useCopy } from "@/lib/locale";

import { validateMediaFile } from "@/lib/media-validation";
import { useFeatureFlags } from "@/lib/feature-flags";
import { moderateMessage } from "@/lib/moderation";
import {
  ESCROW_STATE_LABEL,
  relativeTime,
  useEscrow,
  type EscrowEntry,
} from "@/lib/escrow";
import { tierLabel, initials, money, type Tier } from "@/lib/types";
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

/** Stable per-day key used to group the transcript into date sections. */
function dayKey(iso: string) {
  return new Date(iso).toDateString();
}

/** "Today" / "Yesterday" / a short date for the day separators. */
function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(iso) === today.toDateString()) return "Today";
  if (dayKey(iso) === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" });
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
  const [locating, setLocating] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [payingBookingId, setPayingBookingId] = useState("");
  const [giftOpen, setGiftOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  /** Booking the open rating dialog belongs to, when it followed a visit. */
  const [ratingBooking, setRatingBooking] = useState<BookingRow | null>(null);
  const [showListOnMobile, setShowListOnMobile] = useState(true);
  const [removeThread, setRemoveThread] = useState<ThreadRow | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<MessageRowType | null>(null);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const uploads = useUploadQueue();
  const [removing, setRemoving] = useState(false);
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const { canCall, can, platform, giftsFor, moderation } = useRoomSettings();
  const { t } = useCopy();

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
  const bookingsQuery = useBookings();
  const bookingsById = useMemo(() => {
    const map = new Map<string, BookingRow>();
    for (const booking of bookingsQuery.data ?? []) map.set(booking.id, booking);
    return map;
  }, [bookingsQuery.data]);
  const bookingCheckout = useServerFn(startBookingCheckout);
  const sendQuote = useServerFn(createSpecialistQuote);
  const giftCheckout = useServerFn(startGiftCheckout);
  const logHit = useLogModerationHit();
  const reports = useReportMutations();
  const submitRating = useSubmitRating();
  const {
    settings: escrow,
    entries: allEscrows,
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

  /** Conversations matching the sidebar search box. */
  const visibleThreads = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return threadList;
    return threadList.filter((thread) => {
      const otherId = thread.client_id === userId ? thread.specialist_id : thread.client_id;
      const name = peopleById.get(otherId)?.display_name ?? "";
      return (
        name.toLowerCase().includes(term) ||
        (thread.last_message ?? "").toLowerCase().includes(term)
      );
    });
  }, [threadList, search, peopleById, userId]);

  /**
   * "Clear chat" is per member: everything older than their own cleared-at
   * stamp drops out of their view while the other side keeps the full history.
   */
  const clearedAt = useMemo(() => {
    if (!activeThread) return null;
    const stamps = iAmClient
      ? [activeThread.client_cleared_at, activeThread.client_hidden_at]
      : [activeThread.specialist_cleared_at, activeThread.specialist_hidden_at];
    const times = stamps
      .filter((stamp): stamp is string => Boolean(stamp))
      .map((stamp) => new Date(stamp).getTime())
      .filter((time) => Number.isFinite(time));
    if (!times.length) return null;
    return new Date(Math.max(...times)).toISOString();
  }, [activeThread, iAmClient]);
  const visibleMessages = useMemo(() => {
    if (!clearedAt) return messages;
    const cutoff = new Date(clearedAt).getTime();
    return messages.filter((message) => new Date(message.created_at).getTime() > cutoff);
  }, [messages, clearedAt]);

  // Live device presence: the availability switch only reads "Available now"
  // while the member's device is actually reachable.
  const peerOnline = useIsOnline(peerId || undefined, peer?.last_seen_at ?? null);
  const { peerTyping, notifyTyping, notifyStopped } = useTypingIndicator(
    activeThread?.id,
    userId || undefined,
  );

  const ratingsQuery = useRatings(peerId);
  const myRating = useMemo(() => {
    const mine = (ratingsQuery.data ?? []).filter((rating) => rating.rater_id === userId);
    if (!mine.length) return null;
    return mine.reduce((sum, rating) => sum + rating.stars, 0) / mine.length;
  }, [ratingsQuery.data, userId]);

  const myPeerRatings = useMemo(
    () => (ratingsQuery.data ?? []).filter((rating) => rating.rater_id === userId),
    [ratingsQuery.data, userId],
  );
  const ratedBookingIds = useMemo(
    () =>
      new Set(
        myPeerRatings.map((rating) => rating.booking_id).filter((id): id is string => Boolean(id)),
      ),
    [myPeerRatings],
  );

  const escrowEntries = activeThread ? threadEntries(activeThread.id) : [];

  // Only a client who actually paid for and received a visit may rate.
  const allBookings = useMemo(() => bookingsQuery.data ?? [], [bookingsQuery.data]);
  const canRatePeer =
    iAmClient &&
    Boolean(peerId) &&
    canReview({
      userId,
      specialistId: peerId!,
      bookings: allBookings,
      escrows: allEscrows,
    });
  const roomGifts = giftsFor(room);
  const giftsAllowed =
    flags.giftsEnabled && escrow.tipsEnabled && roomGifts.length > 0 && iAmClient;
  const audioAllowed = flags.callsEnabled && canCall(room, "audio");
  const videoAllowed = flags.callsEnabled && canCall(room, "video");
  const photosAllowed =
    flags.attachmentsEnabled && flags.chatImageSharing && can(room, "photoSharing");
  const filesAllowed = flags.attachmentsEnabled && can(room, "fileSharing");
  const locationAllowed = flags.chatLocationSharing;
  const bookingsOpen = flags.bookingsEnabled && platform.bookingsEnabled;

  useEffect(() => {
    if (!activeThread) return;
    void markThreadRead(activeThread.id, iAmClient ? "client" : "specialist");
  }, [activeThread?.id, iAmClient, activeThread]);

  // Opening a thread lands on the newest message straight away (no visible
  // scroll from the top); later arrivals glide into view like a native app.
  const jumpedThreadRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeThread?.id) return;
    const first = jumpedThreadRef.current !== activeThread.id;
    if (first) jumpedThreadRef.current = activeThread.id;
    const node = bottomRef.current;
    if (!node) return;
    const behavior: ScrollBehavior = first ? "auto" : "smooth";
    node.scrollIntoView({ behavior, block: "end" });
    if (first) {
      // The virtualised scroll area can still be laying out on first paint.
      const timer = window.setTimeout(
        () => bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" }),
        120,
      );
      return () => window.clearTimeout(timer);
    }
    return;
  }, [activeThread?.id, visibleMessages.length]);

  async function post(
    input: Partial<Omit<MessageRowType, "id" | "created_at" | "thread_id">> & { body: string },
  ) {
    if (!activeThread) return null;
    try {
      return await sendMessage.mutateAsync({
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Message could not be sent";
      if (message.includes("ASHNIGHT_MODERATION_BLOCKED")) {
        toast.error("Message withheld", {
          description:
            "Ashnight keeps contact details and off-platform deals out of chat. Edit your message and try again.",
        });
        return null;
      }
      throw error;
    }
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
    notifyStopped();
    try {
      await post({ body: verdict.body, redacted: verdict.action === "mask" });
    } catch (error) {
      // Never swallow the member's text: put it back in the composer so they
      // can retry instead of retyping.
      setDraft(body);
      const raw = error instanceof Error ? error.message : "";
      const offline =
        /failed to fetch|network|load failed|typeerror/i.test(raw) ||
        (typeof navigator !== "undefined" && navigator.onLine === false);
      toast.error(offline ? "No connection — message not sent" : "Message could not be sent", {
        description: offline
          ? "Your message is still in the box. Check your connection and tap send again."
          : raw || "Please try again in a moment.",
      });
    }
  }

  async function attach(file: File | undefined, kindLabel: "file" | "photo") {
    if (!file || !activeThread) return;
    const allowed = kindLabel === "photo" ? photosAllowed : filesAllowed;
    if (!allowed) {
      toast(`${kindLabel === "photo" ? "Photo" : "File"} sharing isn't included in the ${tierLabel(room)} room`);
      return;
    }
    const problem = await validateMediaFile(
      file,
      kindLabel === "photo"
        ? { kind: "image", maxMB: 10 }
        : { kind: "document", maxMB: 20 },
    );
    if (problem) {
      toast.error(problem);
      return;
    }
    // The progress row lives above the composer, with cancel and retry, so a
    // slow connection is visible instead of looking like a frozen chat.
    const threadId = activeThread.id;
    uploads.start({
      bucket: "attachments",
      path: `${userId}/${threadId}/${Date.now()}-${safeName(file.name)}`,
      file,
      onStored: async (storedPath) => {
        const url = await signAttachment(storedPath);
        await post({ body: file.name, attachment_url: url, attachment_name: file.name });
      },
    });
  }

  /**
   * Shares the member's current coordinates as a location message. The browser
   * asks permission every time - nothing is tracked in the background.
   */
  async function shareLocation() {
    if (!activeThread) return;
    if (!locationAllowed) {
      toast("Location sharing is switched off right now");
      return;
    }
    if (!("geolocation" in navigator)) {
      toast.error("This device cannot share a location.");
      return;
    }
    setLocating(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
        });
      });
      const lat = position.coords.latitude.toFixed(6);
      const lng = position.coords.longitude.toFixed(6);
      await post({
        kind: "location",
        body: lat + "," + lng,
        attachment_url:
          "https://www.google.com/maps/search/?api=1&query=" + lat + "," + lng,
        attachment_name: "Shared location",
      });
    } catch (error) {
      const denied =
        typeof error === "object" &&
        error !== null &&
        (error as GeolocationPositionError).code === 1;
      toast.error(denied ? "Location permission was declined." : "We could not get your location.");
    } finally {
      setLocating(false);
    }
  }

  function startCall(mode: CallMode) {
    const allowed = mode === "video" ? videoAllowed : audioAllowed;
    const modeWord = mode === "video" ? t("chat.video") : t("chat.voice");
    const callWord = t("chat.call");
    if (!allowed) {
      toast.error(
        `${modeWord} ${callWord}s are switched off for the ${tierLabel(room)} room`,
        { description: "Upgrade your room or ask support to enable it." },
      );
      return;
    }
    if (!activeThread || !peerId) return;
    setCall(mode);
    // Ring the other member wherever they are in Ashnight, so they can answer
    // without having this thread already open.
    void sendRing(peerId, {
      kind: "invite",
      threadId: activeThread.id,
      mode,
      fromId: userId,
      fromName: profile?.display_name ?? "An Ashnight member",
    });
    systemNote(`${modeWord} ${callWord} started — Ashnight never records ${callWord}s.`);

  }

  /** Specialist prices the visit; the client pays from the thread. */
  async function handleQuote(quote: QuoteDraft) {
    if (!activeThread) return;
    try {
      const result = await sendQuote({
        data: {
          threadId: activeThread.id,
          serviceId: quote.serviceId,
          serviceName: quote.serviceName,
          hours: quote.hours,
          rate: quote.rate,
          addons: quote.addons,
          scheduledForIso: quote.scheduledForIso,
          notes: quote.notes,
        },
      });

      await post({
        kind: "booking",
        booking_id: result.bookingId,
        body: `Payment request · ${quote.serviceName} · ${quote.hours}h at ${money(
          quote.rate,
        )}/h${quote.addons.length ? ` · Add-ons: ${quote.addons.join(", ")}` : ""} · ${money(
          result.total,
        )} to pay${quote.notes ? ` — ${quote.notes}` : ""}`,
      });

      setQuoteOpen(false);
      toast.success("Payment request sent", {
        description: `${firstName} can pay ${money(result.total)} straight into escrow.`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment request could not be sent");
    }
  }

  /** Client pays an outstanding booking (their own request, or a specialist quote). */
  async function payBooking(bookingId: string) {
    try {
      setPayingBookingId(bookingId);
      const checkout = await bookingCheckout({
        data: {
          bookingId,
          callbackUrl: `${window.location.origin}/payment/return`,
        },
      });
      toast.success("Taking you to Paystack…", {
        description: `${money(checkout.amount)} will be held in Ashnight escrow.`,
      });
      window.location.href = checkout.authorizationUrl;
    } catch (error) {
      setPayingBookingId("");
      toast.error(error instanceof Error ? error.message : "Payment could not be started");
    }
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
        scheduled_for: request.scheduledForIso,
        notes: request.notes,
        status: "requested",
      });

      await post({
        kind: "booking",
        booking_id: booking.id,
        body: `${request.service} · ${request.hours}h${
          request.scheduledFor ? ` · ${request.scheduledFor}` : ""
        }${request.addons.length ? ` · Add-ons: ${request.addons.join(", ")}` : ""} · ${money(
          request.total,
        )} — opening Paystack (${paystackChannel(request.channel).label})`,
      });

      const checkout = await bookingCheckout({
        data: {
          bookingId: booking.id,
          callbackUrl: `${window.location.origin}/payment/return`,
          channel: request.channel,
        },
      });

      toast.success("Taking you to Paystack…", {
        description: `${money(checkout.amount)} will be held in Ashnight escrow.`,
      });
      window.location.href = checkout.authorizationUrl;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Booking could not be created");
    }
  }

  async function handleGift(gift: GiftDraft) {
    if (!activeThread || !peerId) return;
    try {
      const checkout = await giftCheckout({
        data: {
          threadId: activeThread.id,
          giftKey: gift.giftId,
          giftLabel: `${gift.glyph} ${gift.giftLabel}`,
          amount: gift.amount,
          callbackUrl: `${window.location.origin}/payment/return`,
          channel: gift.channel,
        },
      });

      toast.success("Taking you to Paystack…", {
        description: `${firstName} receives ${money(checkout.net)} once the charge clears.`,
      });
      window.location.href = checkout.authorizationUrl;
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
        booking_id: ratingBooking?.id ?? null,
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
          toast.success(`${ratingDraft.stars}-star rating posted`, {
            description: "Ashnight reviews specialist rooms from these ratings.",
          });
          setRatingBooking(null);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  /**
   * Client confirms the visit, then gets asked to rate it straight away — the
   * rating is the performance record Ashnight uses for room placement.
   */
  async function confirmAndReview(escrowId: string) {
    const entry = escrowEntries.find((row) => row.id === escrowId);
    await confirmComplete(escrowId);
    if (!iAmClient) return;
    const booking = entry?.booking_id ? bookingsById.get(entry.booking_id) : undefined;
    if (booking && ratedBookingIds.has(booking.id)) return;
    setRatingBooking(booking ?? null);
    setRatingOpen(true);
  }



  /** Which side of a thread this member sits on, for the hidden-at column. */
  function sideOf(thread: ThreadRow) {
    return thread.client_id === userId ? ("client" as const) : ("specialist" as const);
  }

  /**
   * Clears conversations from this member's own list only, then offers a short
   * undo window — nothing is deleted for the other person either way.
   */
  async function removeThreads(targets: ThreadRow[]) {
    if (!targets.length) return;
    setRemoving(true);
    try {
      for (const thread of targets) {
        await hideThread(thread.id, sideOf(thread));
      }
      if (targets.some((thread) => thread.id === activeThreadId)) setActiveThreadId("");
      await queryClient.invalidateQueries({ queryKey: ["threads"] });
      setRemoveThread(null);
      setSelectMode(false);
      setSelectedIds([]);
      toast.success(
        targets.length === 1
          ? "Conversation removed from your list"
          : `${targets.length} conversations removed from your list`,
        {
          duration: 8000,
          action: {
            label: "Undo",
            onClick: () => {
              void (async () => {
                try {
                  for (const thread of targets) {
                    await unhideThread(thread.id, sideOf(thread));
                  }
                  await queryClient.invalidateQueries({ queryKey: ["threads"] });
                  toast.success(
                    targets.length === 1 ? "Conversation restored" : "Conversations restored",
                  );
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "Couldn't restore that conversation",
                  );
                }
              })();
            },
          },
        },
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove that conversation");
    } finally {
      setRemoving(false);
    }
  }

  /**
   * Hides the history of the open thread for this member only, with a short
   * undo window that rolls the stamp back to whatever it was before.
   */
  async function clearHistory() {
    if (!activeThread) return;
    const side = sideOf(activeThread);
    const previous = clearedAt;
    setClearing(true);
    try {
      await clearThread(activeThread.id, side);
      await queryClient.invalidateQueries({ queryKey: ["threads"] });
      setClearOpen(false);
      toast.success("Chat cleared from your view", {
        description: `${firstName} keeps their copy. Bookings, payments and escrow records are untouched.`,
        duration: 8000,
        action: {
          label: "Undo",
          onClick: () => {
            void (async () => {
              try {
                await restoreThreadHistory(activeThread.id, side, previous);
                await queryClient.invalidateQueries({ queryKey: ["threads"] });
                toast.success("History restored");
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Couldn't restore that history",
                );
              }
            })();
          },
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't clear this chat");
    } finally {
      setClearing(false);
    }
  }

  /** Deletes one of my own messages for both sides of the thread. */
  async function removeMessage(message: MessageRowType) {
    setDeletingMessage(true);
    try {
      await deleteOwnMessage(message.id);
      await queryClient.invalidateQueries({ queryKey: ["messages", message.thread_id] });
      setMessageToDelete(null);
      toast.success("Message deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete that message");
    } finally {
      setDeletingMessage(false);
    }
  }

  async function copyMessage(body: string) {
    try {
      await navigator.clipboard.writeText(body);
      toast.success("Message copied");
    } catch {
      toast.error("Your browser blocked the clipboard");
    }
  }


  function openGift() {
    if (!escrow.tipsEnabled) {
      toast("Cash gifts are switched off by Ashnight right now.");
      return;
    }
    if (!giftsAllowed) {
      toast(`Cash gifts aren't included in the ${tierLabel(room)} room`);
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
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h1 className="font-display text-base font-semibold">Messages</h1>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {threadList.length} conversations · {tierLabel(room)} room
                      </p>
                    </div>
                    {threadList.length ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-xs"
                        onClick={() => {
                          setSelectMode((current) => !current);
                          setSelectedIds([]);
                        }}
                      >
                        {selectMode ? "Done" : "Select"}
                      </Button>
                    ) : null}
                  </div>

                  {threadList.length ? (
                    <div className="relative mt-3">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search conversations"
                        className="h-9 rounded-full pl-9 pr-9 text-xs"
                        aria-label="Search conversations"
                      />
                      {search ? (
                        <button
                          type="button"
                          aria-label="Clear search"
                          onClick={() => setSearch("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {selectMode ? (
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() =>
                          setSelectedIds(
                            selectedIds.length === visibleThreads.length
                              ? []
                              : visibleThreads.map((thread) => thread.id),
                          )
                        }
                      >
                        {selectedIds.length === visibleThreads.length && visibleThreads.length
                          ? "Clear all"
                          : "Select all"}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="text-xs"
                        disabled={!selectedIds.length || removing}
                        onClick={() =>
                          void removeThreads(
                            threadList.filter((thread) => selectedIds.includes(thread.id)),
                          )
                        }
                      >
                        <Trash2 className="size-3.5" />
                        {removing ? "Removing…" : `Remove ${selectedIds.length || ""}`.trim()}
                      </Button>
                    </div>
                  ) : null}
                </div>

                <ScrollArea className="min-h-0 flex-1">
                  {threadsQuery.isLoading ? (
                    <p className="p-4 text-xs text-muted-foreground">Loading threads…</p>
                  ) : null}
                  {visibleThreads.map((item) => {
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
                      <div
                        key={item.id}
                        className={cn(
                          "group relative flex w-full items-start gap-3 border-b border-border/50 transition-colors hover:bg-secondary/60",
                          item.id === activeThread?.id && "bg-secondary",
                        )}
                      >
                      {selectMode ? (
                        <label className="flex min-w-0 flex-1 cursor-pointer gap-3 p-4 text-left">
                          <Checkbox
                            className="mt-3"
                            checked={selectedIds.includes(item.id)}
                            aria-label={`Select conversation with ${name}`}
                            onCheckedChange={(checked) =>
                              setSelectedIds((current) =>
                                checked
                                  ? [...current, item.id]
                                  : current.filter((id) => id !== item.id),
                              )
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{name}</p>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {item.last_message || "No messages yet"}
                            </p>
                          </div>
                        </label>
                      ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveThreadId(item.id);
                          setShowListOnMobile(false);
                        }}
                        className="flex min-w-0 flex-1 gap-3 p-4 text-left"
                      >
                        <Avatar className="size-10 border border-border">
                          {other?.avatar_url ? <AvatarImage src={other.avatar_url} alt={name} /> : null}
                          <AvatarFallback className="bg-surface-strong text-xs">
                            {initials(name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p
                              className={cn(
                                "truncate text-sm",
                                unread ? "font-semibold" : "font-medium",
                              )}
                            >
                              {name}
                            </p>
                            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                              {timeLabel(item.last_message_at)}
                            </span>
                          </div>
                          <p
                            className={cn(
                              "mt-1 truncate text-xs",
                              unread ? "text-foreground" : "text-muted-foreground",
                            )}
                          >
                            {item.last_message || "No messages yet"}
                          </p>
                        </div>
                        {unread ? (
                          <Badge className="h-5 min-w-5 justify-center rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                            •
                          </Badge>
                        ) : null}
                      </button>
                      )}
                        {selectMode ? null : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Options for the conversation with ${name}`}
                              className="mr-2 mt-3 size-8 shrink-0 text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100"
                            >
                              <MoreVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuLabel className="truncate text-xs">{name}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => {
                                setActiveThreadId(item.id);
                                setShowListOnMobile(false);
                              }}
                            >
                              Open conversation
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setRemoveThread(item)}
                            >
                              <Trash2 className="size-4" /> Remove from my list
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        )}
                      </div>
                    );
                  })}
                  {!threadsQuery.isLoading && !visibleThreads.length ? (
                    <p className="p-4 text-xs text-muted-foreground">
                      {threadList.length
                        ? `No conversations match “${search}”.`
                        : "No conversations yet. Open one from a specialist profile."}
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
                          {peerTyping
                            ? `${firstName} is typing…`
                            : peer?.available && peerOnline
                              ? "Available now"
                              : peerOnline
                                ? "Online"
                                : `Replies in ~${peer?.response_minutes ?? 30}m`}
                          {myRating ? (
                            <span className="flex items-center gap-1 text-primary">
                              · <Star className="size-3 fill-primary" /> {myRating.toFixed(1)} from you
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <div className="ml-auto flex items-center gap-1">
                        <CallControl
                          allowed={audioAllowed}
                          label={t("chat.voice").toLowerCase()}
                          callWord={t("chat.call")}
                          startWord={t("chat.startCall")}
                          room={tierLabel(room)}
                          onClick={() => startCall("audio")}
                        >
                          <Phone className="size-4" />
                        </CallControl>
                        <CallControl
                          allowed={videoAllowed}
                          label={t("chat.video").toLowerCase()}
                          callWord={t("chat.call")}
                          startWord={t("chat.startCall")}
                          room={tierLabel(room)}
                          onClick={() => startCall("video")}
                        >
                          <Video className="size-4" />
                        </CallControl>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Conversation options">
                              <MoreVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-60">
                            <DropdownMenuLabel className="truncate text-xs">
                              {peerName}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {iAmClient && peerId ? (
                              <DropdownMenuItem asChild>
                                <Link
                                  to="/specialists/$specialistId"
                                  params={{ specialistId: peerId }}
                                >
                                  <UserIcon className="size-4" /> View profile
                                </Link>
                              </DropdownMenuItem>
                            ) : null}
                            {canRatePeer ? (
                              <DropdownMenuItem onSelect={() => setRatingOpen(true)}>
                                <Star className="size-4" /> Rate your visit
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem onSelect={() => setReportOpen(true)}>
                              <Flag className="size-4" /> {t("chat.report")} to trust &amp; safety
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setClearOpen(true)}
                            >
                              <Eraser className="size-4" /> Clear chat history
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() =>
                                setRemoveThread(activeThread as ThreadRow)
                              }
                            >
                              <Trash2 className="size-4" /> Remove conversation
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                    </header>

                    {!audioAllowed && !videoAllowed ? (
                      <p className="flex items-center gap-2 border-b border-border/70 bg-background/50 px-4 py-2 text-[11px] text-muted-foreground">
                        <Lock className="size-3.5 shrink-0" />
                        {t("chat.callsOff")}
                      </p>
                    ) : null}


                    <ScrollArea className="min-h-0 flex-1">
                      <div className="space-y-4 p-4 sm:p-6">
                        {clearedAt ? (
                          <p className="mx-auto flex max-w-md items-center justify-center gap-2 rounded-full border border-dashed border-border bg-background/60 px-4 py-1.5 text-center text-[11px] text-muted-foreground">
                            <Eraser className="size-3 shrink-0" />
                            Older messages are hidden from your view only
                          </p>
                        ) : null}
                        {visibleMessages.map((message, index) => {
                          const previous = visibleMessages[index - 1];
                          const showDay =
                            !previous || dayKey(previous.created_at) !== dayKey(message.created_at);
                          return (
                            <div key={message.id} className="space-y-4">
                              {showDay ? (
                                <div className="relative flex items-center justify-center py-1">
                                  <div className="absolute inset-0 flex items-center">
                                    <Separator className="w-full" />
                                  </div>
                                  <span className="relative bg-background px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                                    {dayLabel(message.created_at)}
                                  </span>
                                </div>
                              ) : null}
                              <MessageBubble
                                message={message}
                                mine={message.author_id === userId}
                                peerFirstName={firstName}
                                escrow={
                                  message.escrow_id
                                    ? escrowEntries.find((entry) => entry.id === message.escrow_id)
                                    : undefined
                                }
                                canResolve={iAmClient}
                                booking={
                                  message.booking_id
                                    ? bookingsById.get(message.booking_id)
                                    : undefined
                                }
                                canPay={iAmClient && bookingsOpen}
                                paying={
                                  !!message.booking_id && payingBookingId === message.booking_id
                                }
                                onPay={(id) => void payBooking(id)}
                                onConfirm={(id) => void confirmAndReview(id)}
                                onDispute={(id, reason) => void raiseIssue(id, reason)}
                                onCopy={(body) => void copyMessage(body)}
                                onDelete={() => setMessageToDelete(message)}
                              />
                            </div>
                          );
                        })}
                        {!visibleMessages.length && !messagesQuery.isLoading ? (
                          <p className="py-10 text-center text-xs text-muted-foreground">
                            No messages here yet — say hello to {firstName}.
                          </p>
                        ) : null}
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
                      ) : (
                        <Button
                          variant="brass"
                          className="w-full"
                          onClick={() =>
                            bookingsOpen
                              ? setQuoteOpen(true)
                              : toast("Booking requests are paused by Ashnight right now.")
                          }
                        >
                          {bookingsOpen ? (
                            <>
                              <Banknote className="size-4" /> Request payment for a job
                            </>
                          ) : (
                            <>
                              <Lock className="size-4" /> Payment requests paused
                            </>
                          )}
                        </Button>
                      )}

                      <UploadProgressList
                        tasks={uploads.tasks}
                        onRetry={uploads.retry}
                        onCancel={uploads.cancel}
                        onDismiss={uploads.dismiss}
                        className="mt-3"
                      />

                      <form
                        className="mt-3 space-y-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void submit();
                        }}
                      >
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

                        <div className="flex w-full items-end gap-2 rounded-2xl border border-border/70 bg-surface-strong/60 px-3 py-2 transition-colors focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 sm:px-4">
                          <EmojiPicker
                            onPick={(emoji) => {
                              setDraft((current) => (current + emoji).slice(0, 1000));
                              notifyTyping();
                              draftRef.current?.focus();
                            }}
                          />
                          <Textarea
                            ref={draftRef}
                            value={draft}
                            rows={1}
                            onChange={(event) => {
                              setDraft(event.target.value);
                              if (event.target.value.trim()) notifyTyping();
                              else notifyStopped();
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                void submit();
                              }
                            }}
                            placeholder={`Message ${firstName}…`}
                            maxLength={1000}
                            /* 16px text keeps iOS from zooming the page on focus. */
                            className="max-h-40 min-h-9 min-w-0 flex-1 resize-none border-0 bg-transparent px-0 py-1.5 text-base leading-relaxed shadow-none focus-visible:ring-0"
                          />
                          <Button
                            type="submit"
                            size="icon"
                            variant="brass"
                            className="size-9 shrink-0 rounded-full"
                            disabled={!draft.trim() || sendMessage.isPending}
                            aria-label="Send message"
                          >
                            <Send className="size-4" />
                          </Button>
                        </div>

                        <div className="flex flex-wrap items-center gap-1">
                          {iAmClient ? (
                            <>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
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

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Attach file"
                            onClick={() =>
                              filesAllowed
                                ? fileRef.current?.click()
                                : toast(`File sharing isn't included in the ${tierLabel(room)} room`)
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
                                : toast(`Photo sharing isn't included in the ${tierLabel(room)} room`)
                            }
                          >
                            {photosAllowed ? (
                              <ImageIcon className="size-4" />
                            ) : (
                              <Lock className="size-4 opacity-60" />
                            )}
                          </Button>

                          {locationAllowed ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Share my location"
                              disabled={locating}
                              onClick={() => void shareLocation()}
                            >
                              {locating ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <MapPin className="size-4" />
                              )}
                            </Button>
                          ) : null}
                        </div>
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

            <QuoteDialog
              clientName={firstName}
              defaultRate={profile?.hourly_rate ?? 0}
              open={quoteOpen}
              onOpenChange={setQuoteOpen}
              onConfirm={(quote) => void handleQuote(quote)}
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
              serviceName={ratingBooking?.service_name}
              submitting={submitRating.isPending}
              onOpenChange={(next) => {
                setRatingOpen(next);
                if (!next) setRatingBooking(null);
              }}
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
                  systemNote(t("chat.callEnded"));
                }}
              />
            ) : null}
          </>
        ) : null}
      </div>

      <AlertDialog
        open={Boolean(removeThread)}
        onOpenChange={(open) => {
          if (!open && !removing) setRemoveThread(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              You can undo this for a few seconds afterwards. It disappears from your list only — the other member keeps their copy, and bookings,
              payments and escrow records are untouched. If they message you again, the thread comes
              back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={(event) => {
                event.preventDefault();
                void removeThreads(removeThread ? [removeThread] : []);
              }}
            >
              {removing ? "Removing…" : "Remove chat"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear this chat history?</AlertDialogTitle>
            <AlertDialogDescription>
              Every message here disappears from your view. {firstName} keeps their own copy, and
              bookings, payments and escrow records stay exactly as they are. You get a short window
              to undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Keep history</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={clearing}
              onClick={(event) => {
                event.preventDefault();
                void clearHistory();
              }}
            >
              {clearing ? "Clearing…" : "Clear history"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!messageToDelete}
        onOpenChange={(open) => {
          if (!open) setMessageToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              It is removed for both of you. Anything already paid or held in escrow is unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingMessage}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingMessage}
              onClick={(event) => {
                event.preventDefault();
                if (messageToDelete) void removeMessage(messageToDelete);
              }}
            >
              {deletingMessage ? "Deleting…" : "Delete message"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </TooltipProvider>

  );
}

function CallControl({
  allowed,
  label,
  callWord,
  startWord,
  room,
  onClick,
  children,
}: {
  allowed: boolean;
  label: string;
  callWord: string;
  startWord: string;
  room: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const start = `${startWord} ${label} ${callWord}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClick}
          aria-label={start}
          className={cn(!allowed && "text-muted-foreground/50")}
        >
          {allowed ? children : <Lock className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {allowed ? start : `${label} ${callWord}s are off for the ${room} room`}
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
  booking,
  canPay,
  paying,
  onPay,
  onConfirm,
  onDispute,
  onCopy,
  onDelete,
}: {
  message: MessageRowType;
  mine: boolean;
  peerFirstName: string;
  escrow?: EscrowEntry | undefined;
  canResolve: boolean;
  booking?: BookingRow | undefined;
  canPay: boolean;
  paying: boolean;
  onPay: (id: string) => void;
  onConfirm: (id: string) => void;
  onDispute: (id: string, reason: string) => void;
  onCopy: (body: string) => void;
  onDelete: () => void;
}) {
  if (message.kind === "system") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-3">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-accent/60 text-accent">
          <ShieldCheck className="size-3" />
        </span>
        <p className="text-[12px] leading-snug text-muted-foreground">{message.body}</p>
      </div>
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

  if (message.kind === "location") {
    const [lat, lng] = message.body.split(",");
    const mapUrl =
      message.attachment_url ??
      "https://www.google.com/maps/search/?api=1&query=" + message.body.trim();
    return (
      <div className={cn("group flex items-end gap-1", mine ? "justify-end" : "justify-start")}>
        {mine ? (
          <MessageActions mine onCopy={() => onCopy(message.body)} onDelete={onDelete} />
        ) : null}
        <div className="max-w-sm rounded-xl border border-border bg-card p-4">
          <p className="eyebrow text-primary">Location shared</p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {lat}, {lng}
          </p>
          <a
            href={mapUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            <MapPin className="size-4" /> Open in maps
          </a>
        </div>
      </div>
    );
  }

  if (message.kind === "booking") {
    const unpaid = !escrow && (!booking || booking.status === "requested");
    const due = booking ? Number(booking.hours) * booking.rate : 0;
    const dueWithFee = booking
      ? due + Math.round(due * (Number(booking.platform_fee_pct ?? 0) / 100))
      : 0;
    return (
      <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
        <div className="max-w-sm rounded-xl border border-primary/30 bg-primary/10 p-4">
          <p className="eyebrow text-primary">
            {escrow ? "Service requested · funds in escrow" : "Payment request · awaiting payment"}
          </p>
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
          ) : unpaid && canPay && message.booking_id ? (
            <div className="mt-3">
              <Button
                size="sm"
                variant="brass"
                disabled={paying}
                onClick={() => onPay(message.booking_id!)}
              >
                {paying ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Banknote className="size-3.5" />
                )}
                {dueWithFee ? `Pay ${money(dueWithFee)} into escrow` : "Pay into escrow"}
              </Button>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Ashnight holds the money until you confirm the visit.
              </p>
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CheckCheck className="size-3.5" /> Awaiting {unpaid ? "payment" : "confirmation"} from{" "}
              {peerFirstName}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("group flex items-end gap-1", mine ? "justify-end" : "justify-start")}>
      {mine ? (
        <MessageActions mine onCopy={() => onCopy(message.body)} onDelete={onDelete} />
      ) : null}
      <div className="max-w-[85%]">
        <div
          className={cn(
            "text-sm leading-relaxed shadow-sm",
            message.attachment_url ? "rounded-2xl p-1.5" : "rounded-2xl px-4 py-2.5",
            mine
              ? "rounded-tr-none border border-primary/20 bg-primary text-primary-foreground"
              : "rounded-tl-none border border-border/70 bg-card text-foreground",
          )}
        >
          {message.attachment_url ? (
            <MediaAttachment
              url={message.attachment_url}
              name={message.attachment_name ?? "Attachment"}
            />
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
      {!mine ? <MessageActions onCopy={() => onCopy(message.body)} /> : null}
    </div>
  );
}

/**
 * Hover/tap actions on a single message: copy the text, and — for your own
 * messages — delete it for everyone in the thread.
 */
function MessageActions({
  mine = false,
  onCopy,
  onDelete,
}: {
  mine?: boolean;
  onCopy: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 pb-5 opacity-70 transition-opacity focus-within:opacity-100 group-hover:opacity-100 sm:opacity-0">
      <Button
        variant="ghost"
        size="icon"
        className="size-7 text-muted-foreground"
        aria-label="Copy message"
        onClick={onCopy}
      >
        <Copy className="size-3.5" />
      </Button>
      {mine && onDelete ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-destructive"
          aria-label="Delete message"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </Button>
      ) : null}
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

/**
 * Chat attachment.
 *
 * Photos and clips open in a lightbox inside the app instead of jumping to a
 * raw file URL in a new tab; anything else stays a plain download link.
 */
function MediaAttachment({ url, name }: { url: string; name: string }) {
  const [open, setOpen] = useState(false);
  const isImage = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(name) || /image/i.test(name);
  const isVideo = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(name) || /video/i.test(name);

  if (!isImage && !isVideo) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline">
        <Paperclip className="size-3.5" />
        {name}
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full overflow-hidden rounded-xl bg-surface-strong"
        aria-label={`Open ${name}`}
      >
        {isImage ? (
          <img
            src={url}
            alt={name}
            loading="lazy"
            className="max-h-64 w-full rounded-xl object-cover"
          />
        ) : (
          <video src={url} muted playsInline className="max-h-64 w-full rounded-xl object-cover" />
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl border-border/70 bg-panel p-2">
          <DialogTitle className="sr-only">{name}</DialogTitle>
          {isImage ? (
            <img src={url} alt={name} className="max-h-[80vh] w-full rounded-lg object-contain" />
          ) : (
            <video
              src={url}
              controls
              autoPlay
              playsInline
              className="max-h-[80vh] w-full rounded-lg"
            />
          )}
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="px-2 pb-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Open original · {name}
          </a>
        </DialogContent>
      </Dialog>
    </>
  );
}
