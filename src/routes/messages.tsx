import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CediIcon } from "@/components/icons/cedi-icon";
import {
  ArrowLeft,
  CheckCheck,
  Copy,
  Download,
  Eraser,
  ExternalLink,
  Flag,
  Reply,

  Gift as GiftIcon,
  Image as ImageIcon,
  Lock,
  Loader2,
  MapPin,
  MoreVertical,
  Paperclip,
  Phone,
  Search,
  ShieldAlert,
  Send,
  ShieldCheck,
  Smile,
  Star,
  Trash2,
  User as UserIcon,
  Video,
  X,
} from "lucide-react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
  acknowledgeBookingRequest,
  createClientBookingRequest,
  createSpecialistQuote,
  requestBookingAcknowledgement,
  startBookingCheckout,
  startGroupBookingCheckout,
  startGiftCheckout,
} from "@/lib/payments.functions";
import { getGroupBookingForThread, respondToGroupBooking } from "@/lib/group-bookings.functions";
import { useAuth } from "@/hooks/use-auth";
import {
  clearThread,
  deleteOwnMessage,
  hideThread,
  restoreThreadHistory,
  unhideThread,
  markThreadRead,
  useBookings,
  useLogModerationHit,
  useMessages,
  useProfilesByIds,
  useRatings,
  useReportMutations,
  useSendMessage,
  useStoredMedia,
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
import { packsForRoom, useEmojiPacks } from "@/lib/chat-emoji";
import { cn } from "@/lib/utils";

/** Local-only list of messages this device has hidden. */
const HIDDEN_MESSAGES_KEY = "ashnight-hidden-messages-v1";



export const Route = createFileRoute("/messages")({
  validateSearch: (search: Record<string, unknown>): { thread?: string } => {
    const thread = typeof search["thread"] === "string" ? search["thread"] : undefined;
    return thread ? { thread } : {};
  },
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
  const { thread } = Route.useSearch();

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

  return <MessagesInbox userId={user.id} profile={profile} initialThreadId={thread} />;
}

function MessagesInbox({
  userId,
  profile,
  initialThreadId,
}: {
  userId: string;
  profile: ProfileRow | null;
  initialThreadId?: string | undefined;
}) {
  const [activeThreadId, setActiveThreadId] = useState(initialThreadId ?? "");
  const [draft, setDraft] = useState("");
  const [call, setCall] = useState<CallMode | null>(null);
  const [locating, setLocating] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [payingBookingId, setPayingBookingId] = useState("");
  const [ackBookingId, setAckBookingId] = useState("");
  const [groupAction, setGroupAction] = useState<"confirm" | "decline" | "pay" | "">("");
  const [giftOpen, setGiftOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  /** Booking the open rating dialog belongs to, when it followed a visit. */
  const [ratingBooking, setRatingBooking] = useState<BookingRow | null>(null);
  const [showListOnMobile, setShowListOnMobile] = useState(!initialThreadId);
  const [removeThread, setRemoveThread] = useState<ThreadRow | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<MessageRowType | null>(null);
  // Message the composer is replying to (WhatsApp-style quoted reply).
  const [replyTo, setReplyTo] = useState<MessageRowType | null>(null);
  const [deletingMessage, setDeletingMessage] = useState(false);
  // Messages hidden from this device only — used when deleting somebody else's
  // message, which we can never remove from their side.
  const [hiddenMessageIds, setHiddenMessageIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(HIDDEN_MESSAGES_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
    } catch {
      return [];
    }
  });
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

  /**
   * Avatars live in a private bucket, so the raw stored path is not loadable by
   * <img>. Sign every counterpart avatar once and look them up by path.
   */
  const avatarItems = useMemo(
    () =>
      (peopleQuery.data ?? []).flatMap((person) =>
        person.avatar_url ? [{ bucket: "avatars" as const, value: person.avatar_url }] : [],
      ),
    [peopleQuery.data],
  );
  const { data: avatarUrls } = useStoredMedia(avatarItems);
  const avatarFor = (person: ProfileRow | undefined) =>
    person?.avatar_url ? avatarUrls?.[person.avatar_url] : undefined;


  const messagesQuery = useMessages(activeThread?.id);
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const sendMessage = useSendMessage();
  const bookingsQuery = useBookings();
  const bookingsById = useMemo(() => {
    const map = new Map<string, BookingRow>();
    for (const booking of bookingsQuery.data ?? []) map.set(booking.id, booking);
    return map;
  }, [bookingsQuery.data]);
  const bookingCheckout = useServerFn(startBookingCheckout);
  const askAcknowledgement = useServerFn(requestBookingAcknowledgement);
  const acknowledgeRequest = useServerFn(acknowledgeBookingRequest);
  const groupCheckout = useServerFn(startGroupBookingCheckout);
  const loadGroupBooking = useServerFn(getGroupBookingForThread);
  const respondGroupBooking = useServerFn(respondToGroupBooking);
  const sendQuote = useServerFn(createSpecialistQuote);
  const sendClientBookingRequest = useServerFn(createClientBookingRequest);
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
    const cutoff = clearedAt ? new Date(clearedAt).getTime() : null;
    return messages.filter((message) => {
      if (hiddenMessageIds.includes(message.id)) return false;
      if (cutoff !== null && new Date(message.created_at).getTime() <= cutoff) return false;
      const body = message.body ?? "";
      // "Payment confirmed" notes are addressed to the member.
      if (
        !iAmClient &&
        (body === "The specialist has been notified and can start the job." ||
          body.startsWith("Payment confirmed and held in escrow"))
      )
        return false;
      // The "awaiting acknowledgement" note is only actionable for the specialist.
      if (iAmClient && /request for acknowledgement/i.test(body)) return false;
      return true;
    });
  }, [messages, clearedAt, hiddenMessageIds, iAmClient]);

  /** Hides a message on this device only and remembers it across reloads. */
  function hideMessageLocally(id: string) {
    setHiddenMessageIds((current) => {
      const next = current.includes(id) ? current : [...current, id].slice(-500);
      try {
        window.localStorage.setItem(HIDDEN_MESSAGES_KEY, JSON.stringify(next));
      } catch {
        /* private mode — hiding stays for this session only */
      }
      return next;
    });
  }

  // Admin-published emoji packs the current room is allowed to use.
  const { packs: emojiPacks } = useEmojiPacks();
  const extraEmojiGroups = useMemo(
    () =>
      packsForRoom(emojiPacks, room).map((pack) => ({ label: pack.label, emoji: pack.emoji })),
    [emojiPacks, room],
  );


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

  // Who is being rung right now, and whether anyone actually joined.
  const callInviteesRef = useRef<string[]>([]);
  const callJoinedRef = useRef(false);

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
  const groupBookingQuery = useQuery({
    queryKey: ["group-booking-thread", activeThread?.id],
    enabled: Boolean(activeThread?.id && activeThread.is_group),
    queryFn: () => loadGroupBooking({ data: { threadId: activeThread?.id ?? "" } }),
  });
  const groupBooking = groupBookingQuery.data;
  const myGroupLeg = groupBooking?.group_booking_members.find((member) => member.specialist_id === userId);

  async function answerGroupRequest(available: boolean) {
    if (!groupBooking) return;
    setGroupAction(available ? "confirm" : "decline");
    try {
      await respondGroupBooking({ data: { groupBookingId: groupBooking.id, available } });
      await groupBookingQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ["messages", activeThread?.id] });
      toast.success(available ? "Availability confirmed" : "The client has been told you are unavailable");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Your response could not be saved");
    } finally {
      setGroupAction("");
    }
  }

  async function payGroupBooking() {
    if (!groupBooking) return;
    setGroupAction("pay");
    try {
      const result = await groupCheckout({ data: { groupBookingId: groupBooking.id, callbackUrl: `${window.location.origin}/payment/return` } });
      toast.success("Taking you to Paystack…", { description: `${money(result.amount)} will be divided into protected escrow allocations.` });
      window.location.href = result.authorizationUrl;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Group payment could not be started");
      setGroupAction("");
    }
  }

  useEffect(() => {
    if (!activeThread) return;
    void markThreadRead(activeThread.id, iAmClient ? "client" : "specialist");
  }, [activeThread?.id, iAmClient, activeThread]);

  // Opening a thread lands on the newest message straight away (no visible
  // scroll from the top); later arrivals glide into view like a native app.
  const jumpedThreadRef = useRef<string | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!activeThread?.id) return;
    // Wait for the thread's messages to actually be in the DOM: pinning against
    // an empty list used to burn the "first open" flag, after which every later
    // batch only got a smooth nudge that the still-growing list swallowed.
    if (visibleMessages.length === 0) return;
    const first = jumpedThreadRef.current !== activeThread.id;
    if (first) jumpedThreadRef.current = activeThread.id;

    const viewportOf = () =>
      messageListRef.current?.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ??
      bottomRef.current?.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ??
      null;

    const jump = (behavior: ScrollBehavior) => {
      const viewport = viewportOf();
      if (viewport) {
        if (behavior === "smooth") {
          viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
        } else {
          viewport.scrollTop = viewport.scrollHeight;
        }
        return;
      }
      bottomRef.current?.scrollIntoView({ behavior, block: "end" });
    };

    const nearBottom = () => {
      const viewport = viewportOf();
      if (!viewport) return true;
      return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 240;
    };

    if (!first) {
      // A new message while the member is reading older history shouldn't yank
      // the view; otherwise glide down to it.
      if (nearBottom()) jump("smooth");
      return;
    }

    jump("auto");
    const frame = requestAnimationFrame(() => jump("auto"));
    const timers = [50, 120, 250, 450, 700, 1000, 1500, 2200, 3000, 4000].map((delay) =>
      window.setTimeout(() => jump("auto"), delay),
    );

    // Images, videos and payment cards keep growing after the first paint, which
    // pushes the newest message back out of view. Stay pinned while the thread
    // settles instead of scrolling once and hoping the height is final. On the
    // native shell the web view also resizes after mount (safe areas, keyboard
    // insets), so watch the scroll viewport as well and keep the window wide.
    let observer: ResizeObserver | undefined;
    const node = messageListRef.current;
    const viewport = viewportOf();
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => jump("auto"));
      if (node) observer.observe(node);
      if (viewport) observer.observe(viewport);
    }
    // Late-loading media fires load/error after layout — re-pin on each.
    const onMediaLoad = () => jump("auto");
    node?.addEventListener("load", onMediaLoad, true);
    node?.addEventListener("loadeddata", onMediaLoad, true);
    const stop = window.setTimeout(() => observer?.disconnect(), 5000);

    return () => {
      cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(stop);
      node?.removeEventListener("load", onMediaLoad, true);
      node?.removeEventListener("loadeddata", onMediaLoad, true);
      observer?.disconnect();
    };
  }, [activeThread?.id, visibleMessages.length]);




  // Switching conversations drops any half-composed reply.
  useEffect(() => {
    setReplyTo(null);
  }, [activeThread?.id]);

  // Returning from a cancelled/closed Paystack checkout can restore this page
  // from the browser cache. Clear transient loading controls so the request is
  // actionable again instead of showing a permanently spinning button.
  useEffect(() => {
    const resetCheckoutState = () => {
      setPayingBookingId("");
      setGroupAction("");
    };
    window.addEventListener("pageshow", resetCheckoutState);
    window.addEventListener("focus", resetCheckoutState);
    return () => {
      window.removeEventListener("pageshow", resetCheckoutState);
      window.removeEventListener("focus", resetCheckoutState);
    };
  }, []);

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
      reply_to_id: input.reply_to_id ?? null,
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

    const quoted = replyTo;
    setDraft("");
    setReplyTo(null);
    notifyStopped();
    try {
      await post({
        body: verdict.body,
        redacted: verdict.action === "mask",
        reply_to_id: quoted?.id ?? null,
      });
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
        // The body is never rendered for attachments (the preview is), so keep it
        // a neutral label — raw file names like "IMG-20240101-WA0007.jpg" trip the
        // contact-detail moderation filter and blocked innocent photos.
        await post({
          body: kindLabel === "photo" ? "Photo" : "File",
          attachment_url: url,
          attachment_name: file.name,
        });
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

    // In an Ash group conversation the whole crew is rung, not just the lead.
    const invitees = activeThread.is_group
      ? [
          activeThread.client_id,
          ...(groupBooking?.group_booking_members ?? []).map((member) => member.specialist_id),
        ].filter((id, index, all) => id && id !== userId && all.indexOf(id) === index)
      : [peerId];

    // Someone who has switched off "available for new bookings" is not rung at
    // all — the caller is told instead of listening to a ring nobody hears.
    const unavailable = invitees.filter((id) => peopleById.get(id)?.available === false);
    const reachable = invitees.filter((id) => peopleById.get(id)?.available !== false);

    if (!reachable.length) {
      const who =
        unavailable
          .map((id) => peopleById.get(id)?.display_name)
          .filter(Boolean)
          .join(", ") || firstName;
      toast.error(`${who} is unavailable right now`, {
        description: `Their phone will not ring. Send a message and they will pick up the ${callWord} when they are back.`,
      });
      return;
    }

    if (unavailable.length) {
      const who = unavailable
        .map((id) => peopleById.get(id)?.display_name ?? "A crew member")
        .join(", ");
      toast.warning(`${who} is unavailable and was not rung`, {
        description: "The rest of the crew is being called now.",
      });
    }

    callInviteesRef.current = reachable;
    callJoinedRef.current = false;
    setCall(mode);
    // Ring everyone wherever they are in Ashnight, so they can answer without
    // having this thread already open.
    reachable.forEach((id) => {
      void sendRing(id, {
        kind: "invite",
        threadId: activeThread.id,
        mode,
        fromId: userId,
        fromName: profile?.display_name ?? "An Ashnight member",
      });
    });
  }

  /** Records the call in chat only once somebody actually joined it. */
  function noteCallJoined(mode: CallMode) {
    if (callJoinedRef.current) return;
    callJoinedRef.current = true;
    const modeWord = mode === "video" ? t("chat.video") : t("chat.voice");
    const callWord = t("chat.call");
    systemNote(`${modeWord} ${callWord} started — Ashnight never records ${callWord}s.`);
  }

  /** Clears the ring on every invited device when the caller hangs up. */
  function stopRinging() {
    const invitees = callInviteesRef.current;
    callInviteesRef.current = [];
    invitees.forEach((id) => {
      void sendRing(id, {
        kind: "cancel",
        fromId: userId,
        fromName: profile?.display_name ?? "An Ashnight member",
      });
    });
  }

  /** Specialist prices the visit or the member scopes a visit to pay for. */
  async function handleQuote(quote: QuoteDraft) {
    if (!activeThread) return;
    try {
      const result = iAmClient
        ? await sendClientBookingRequest({
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
          })
        : await sendQuote({
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

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["messages", activeThread.id] }),
        queryClient.invalidateQueries({ queryKey: ["bookings"] }),
        queryClient.invalidateQueries({ queryKey: ["threads"] }),
      ]);

      setQuoteOpen(false);
      if (iAmClient) {
        toast.success("Request to pay sent", {
          description: `${firstName} will review it; you can pay ${money(result.total)} into escrow once they acknowledge.`,
        });
      } else {
        toast.success("Payment request sent", {
          description: `${firstName} can pay ${money(result.total)} straight into escrow.`,
        });
      }
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

  /** Client sends the request to the specialist for acknowledgement (no charge yet). */
  async function sendForAcknowledgement(bookingId: string) {
    try {
      setAckBookingId(bookingId);
      await askAcknowledgement({ data: { bookingId } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bookings"] }),
        queryClient.invalidateQueries({ queryKey: ["messages"] }),
      ]);
      toast.success("Sent to your specialist", {
        description: "You can pay as soon as they acknowledge the selected services.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That request could not be sent");
    } finally {
      setAckBookingId("");
    }
  }

  /** Specialist acknowledges the selected services, unlocking payment for the client. */
  async function acknowledgeBooking(bookingId: string) {
    try {
      setAckBookingId(bookingId);
      await acknowledgeRequest({ data: { bookingId } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bookings"] }),
        queryClient.invalidateQueries({ queryKey: ["messages"] }),
      ]);
      toast.success("Acknowledged", {
        description: "The member has been asked to pay into escrow.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That request could not be acknowledged");
    } finally {
      setAckBookingId("");
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

  return (
    <TooltipProvider>
      <div
        data-chat-shell
        className="fixed inset-x-0 top-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] flex min-h-0 flex-col overflow-hidden bg-background md:relative md:inset-auto md:h-screen"
      >
        <SiteHeader />

        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden px-0 py-0 sm:px-5 sm:py-8">
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-border/70 bg-surface p-0">
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[300px_minmax(0,1fr)]">
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
                          {avatarFor(other) ? <AvatarImage src={avatarFor(other)} alt={name} /> : null}
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
                  "relative flex min-h-0 min-w-0 flex-col overflow-hidden",
                  showListOnMobile ? "hidden md:flex" : "flex",
                )}
              >
                {!activeThread ? (
                  <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
                    Pick a conversation to start scoping a visit.
                  </div>
                ) : (
                  <>
                    <header className="z-10 grid shrink-0 grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border/70 bg-surface px-3 py-2.5 sm:gap-3 sm:p-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="md:hidden"
                        onClick={() => setShowListOnMobile(true)}
                        aria-label="Back to conversations"
                      >
                        <ArrowLeft className="size-4" />
                      </Button>
                      <Avatar className="size-9 shrink-0 border border-border sm:size-10">
                        {avatarFor(peer) ? <AvatarImage src={avatarFor(peer)} alt={peerName} /> : null}
                        <AvatarFallback className="bg-surface-strong text-xs">
                          {initials(peerName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 overflow-hidden">
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
                      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
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

                    {groupBooking ? (
                      <div className="border-b border-border/70 bg-background/60 px-4 py-3">
                        <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={groupBooking.status === "accepted" ? "default" : groupBooking.status === "cancelled" ? "destructive" : "secondary"}>
                                Ash group · {groupBooking.status}
                              </Badge>
                              <span className="text-sm font-semibold">{groupBooking.service_name}</span>
                              <span className="text-xs text-muted-foreground">{groupBooking.hours}h · {money(groupBooking.total)}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {groupBooking.group_booking_members.map((member) => (
                                <span key={member.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <span className={cn("size-2 rounded-full", member.status === "confirmed" ? "bg-primary" : member.status === "declined" ? "bg-destructive" : "bg-muted-foreground/40")} />
                                  {member.profiles?.display_name ?? member.role_label} · {member.status}
                                </span>
                              ))}
                            </div>
                          </div>
                          {!iAmClient && myGroupLeg?.status === "pending" && groupBooking.status === "requested" ? (
                            <div className="flex shrink-0 gap-2">
                              <Button size="sm" variant="outline" disabled={Boolean(groupAction)} onClick={() => void answerGroupRequest(false)}>Decline</Button>
                              <Button size="sm" variant="brass" disabled={Boolean(groupAction)} onClick={() => void answerGroupRequest(true)}>{groupAction === "confirm" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />} Confirm</Button>
                            </div>
                          ) : null}
                          {iAmClient && groupBooking.status === "accepted" && !groupBooking.paid_at ? (
                            <Button size="sm" variant="brass" disabled={!bookingsOpen || Boolean(groupAction)} onClick={() => void payGroupBooking()}>
                              {groupAction === "pay" ? <Loader2 className="size-3.5 animate-spin" /> : <CediIcon className="size-3.5" />} Pay {money(groupBooking.total)}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}


                    <ScrollArea className="h-0 min-h-0 flex-1">
                      <div ref={messageListRef} className="space-y-4 p-4 sm:p-6">
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
                            <div key={message.id} id={`msg-${message.id}`} className="space-y-4">
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
                                repliedTo={
                                  message.reply_to_id
                                    ? messages.find((row) => row.id === message.reply_to_id)
                                    : undefined
                                }
                                repliedToMine={
                                  message.reply_to_id
                                    ? messages.find((row) => row.id === message.reply_to_id)
                                        ?.author_id === userId
                                    : false
                                }
                                onJumpTo={(id) => {
                                  const node = document.getElementById(`msg-${id}`);
                                  if (!node) {
                                    toast("That message isn't in your view any more.");
                                    return;
                                  }
                                  node.scrollIntoView({ behavior: "smooth", block: "center" });
                                  node.classList.add("ring-2", "ring-primary/60", "rounded-2xl");
                                  window.setTimeout(
                                    () =>
                                      node.classList.remove(
                                        "ring-2",
                                        "ring-primary/60",
                                        "rounded-2xl",
                                      ),
                                    1400,
                                  );
                                }}
                                peerFirstName={firstName}
                                escrow={
                                  message.escrow_id
                                    ? escrowEntries.find((entry) => entry.id === message.escrow_id)
                                    : message.booking_id
                                      ? escrowEntries.find((entry) => entry.booking_id === message.booking_id)
                                      : undefined
                                }
                                canResolve={iAmClient}
                                booking={
                                  message.booking_id
                                    ? bookingsById.get(message.booking_id)
                                    : undefined
                                }
                                 canPay={iAmClient && bookingsOpen}
                                 isClient={iAmClient}
                                 ackBusy={
                                   !!message.booking_id && ackBookingId === message.booking_id
                                 }
                                 onAskAcknowledgement={(id) => void sendForAcknowledgement(id)}
                                 onAcknowledge={(id) => void acknowledgeBooking(id)}
                                paying={
                                  !!message.booking_id && payingBookingId === message.booking_id
                                }
                                onPay={(id) => void payBooking(id)}
                                onConfirm={(id) => void confirmAndReview(id)}
                                onDispute={(id, reason) => void raiseIssue(id, reason)}
                                onCopy={(body) => void copyMessage(body)}
                                onReply={(target) => {
                                  setReplyTo(target);
                                  draftRef.current?.focus();
                                }}
                                onReport={() => setReportOpen(true)}
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


                    <div className="z-10 max-h-[55%] shrink-0 overflow-y-auto overscroll-contain border-t border-border/70 bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:max-h-none sm:overflow-visible sm:p-4">

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

                        {replyTo ? (
                          <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-surface-strong/60 px-3 py-2">
                            <Reply className="size-4 shrink-0 text-primary" />
                            <div className="min-w-0 flex-1 border-l-2 border-l-primary pl-2">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                                Replying to {replyTo.author_id === userId ? "yourself" : firstName}
                              </p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {messagePreview(replyTo)}
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-8 shrink-0 rounded-full"
                              aria-label="Cancel reply"
                              onClick={() => setReplyTo(null)}
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                        ) : null}

                        <div className="flex w-full items-end gap-2 rounded-2xl border border-border/70 bg-surface-strong/60 px-3 py-2 transition-colors focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 sm:px-4">
                          <EmojiPicker
                            extraGroups={extraEmojiGroups}
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
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Request to pay"
                                    onClick={() =>
                                      bookingsOpen
                                        ? setQuoteOpen(true)
                                        : toast("Payment requests are switched off right now.")
                                    }
                                  >
                                    {bookingsOpen ? (
                                      <CediIcon className="size-4" />
                                    ) : (
                                      <Lock className="size-4 opacity-60" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {bookingsOpen
                                    ? `Request to pay ${firstName}`
                                    : "Payment requests are unavailable right now"}
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
            <QuoteDialog
              mode={iAmClient ? "client" : "specialist"}
              peerName={firstName}
              defaultRate={(iAmClient ? peer?.hourly_rate : profile?.hourly_rate) ?? 0}
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
                onPeerJoined={() => noteCallJoined(call)}
                onEnd={() => {
                  const joined = callJoinedRef.current;
                  stopRinging();
                  setCall(null);
                  // An unanswered call leaves nothing behind in the thread.
                  if (joined) systemNote(t("chat.callEnded"));
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
            <AlertDialogTitle>
              {messageToDelete && messageToDelete.author_id === userId
                ? "Delete this message?"
                : "Hide this message?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {messageToDelete && messageToDelete.author_id === userId
                ? "It is removed for both of you. Anything already paid or held in escrow is unaffected."
                : `This removes the message from your view only — ${firstName} keeps it on their side. Nothing paid or held in escrow changes.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingMessage}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingMessage}
              onClick={(event) => {
                event.preventDefault();
                if (!messageToDelete) return;
                if (messageToDelete.author_id === userId) {
                  void removeMessage(messageToDelete);
                  return;
                }
                hideMessageLocally(messageToDelete.id);
                setMessageToDelete(null);
                toast.success("Message hidden from your view");
              }}
            >
              {deletingMessage
                ? "Deleting…"
                : messageToDelete && messageToDelete.author_id === userId
                  ? "Delete message"
                  : "Delete for me"}
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
  isClient,
  ackBusy,
  onAskAcknowledgement,
  onAcknowledge,
  paying,
  onPay,
  onConfirm,
  onDispute,
  onCopy,
  onDelete,
  onReply,
  onReport,
  repliedTo,
  repliedToMine,
  onJumpTo,
}: {
  message: MessageRowType;
  mine: boolean;
  repliedTo?: MessageRowType | undefined;
  repliedToMine?: boolean;
  onJumpTo?: (id: string) => void;
  peerFirstName: string;
  escrow?: EscrowEntry | undefined;
  canResolve: boolean;
  booking?: BookingRow | undefined;
  canPay: boolean;
  isClient: boolean;
  ackBusy: boolean;
  onAskAcknowledgement: (id: string) => void;
  onAcknowledge: (id: string) => void;
  paying: boolean;
  onPay: (id: string) => void;
  onConfirm: (id: string) => void;
  onDispute: (id: string, reason: string) => void;
  onCopy: (body: string) => void;
  onDelete: () => void;
  onReply: (message: MessageRowType) => void;
  onReport: () => void;



}) {
  if (message.kind === "system") {
    const raw = message.body ?? "";
    // The acknowledgement note is written for the member ("you can now pay").
    // The specialist only needs the confirmation that she acknowledged it.
    const ackMatch = /^The specialist acknowledged (.*?)\.\s*The member can now pay securely into escrow\.?$/i.exec(
      raw,
    );
    // The "awaiting acknowledgement" note is only for the specialist to act on.
    const isAsk = /request for acknowledgement/i.test(raw);
    const askDetail = /request for acknowledgement\s*[—-]?\s*(.*?)\.\s*Payment opens once/i.exec(raw)?.[1];
    if (isAsk && isClient) return null;
    const body =
      isAsk && !isClient
        ? `The member sent this request for acknowledgement${askDetail ? ` — ${askDetail}` : ""}. Payment opens once you acknowledge.`
        : ackMatch && !isClient
          ? `You acknowledged ${ackMatch[1]}. Waiting for the member to pay into escrow.`
          : raw;

    return (
      <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-3">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-accent/60 text-accent">
          <ShieldCheck className="size-3" />
        </span>
        <p className="text-[12px] leading-snug text-muted-foreground">{body}</p>
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
        <MessageActions
          mine={mine}
          body={message.body}
          onCopy={() => onCopy(message.body)}
          onReply={() => onReply(message)}
          onReport={onReport}
          attachmentUrl={message.attachment_url}
          onDelete={onDelete}
        >
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
        </MessageActions>
      </div>
    );
  }

  if (message.kind === "booking") {
    const cancelled = booking?.status === "cancelled";
    const paid = Boolean(escrow) || booking?.status === "paid" || booking?.status === "completed";
    const unpaid =
      !paid &&
      !cancelled &&
      (!booking || booking.status === "requested" || booking.status === "accepted");
    const ackRequested = Boolean(booking?.ack_requested_at);
    const acknowledged = Boolean(booking?.acknowledged_at);
    const addons = booking?.addons ?? [];
    const due = booking ? Number(booking.hours) * booking.rate : 0;
    const dueWithFee = booking
      ? due + Math.round(due * (Number(booking.platform_fee_pct ?? 0) / 100))
      : 0;
    return (
      <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
        <div className="max-w-sm rounded-xl border border-primary/30 bg-primary/10 p-4">
          <p className="eyebrow text-primary">
            {paid
              ? "Service confirmed · funds in escrow"
              : cancelled
                ? "Payment request · cancelled"
                : acknowledged
                  ? "Payment request · acknowledged"
                  : ackRequested
                    ? "Payment request · awaiting acknowledgement"
                    : "Payment request · not sent yet"}
          </p>
          <p className="mt-2 text-sm leading-relaxed">{message.body}</p>

          {booking ? (
            <div className="mt-3 space-y-1 rounded-lg border border-border/60 bg-card/70 p-3 text-[11px]">
              <p className="text-xs font-medium text-foreground">{booking.service_name}</p>
              <p className="text-muted-foreground">
                {booking.hours}h at {money(booking.rate)}/h
              </p>
              {addons.length ? (
                <p className="text-muted-foreground">Add-ons: {addons.join(", ")}</p>
              ) : null}
              {dueWithFee ? (
                <p className="text-foreground">Total with service fee: {money(dueWithFee)}</p>
              ) : null}
            </div>
          ) : null}

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
          ) : cancelled ? (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <X className="size-3.5" /> This payment request was cancelled. No payment was taken.
            </p>
          ) : paid ? (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CheckCheck className="size-3.5" /> Payment confirmed
            </p>
          ) : unpaid && isClient && message.booking_id && !ackRequested ? (
            <div className="mt-3">
              <Button
                size="sm"
                variant="brass"
                disabled={ackBusy}
                onClick={() => onAskAcknowledgement(message.booking_id!)}
              >
                {ackBusy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="size-3.5" />
                )}
                Send to {peerFirstName} to acknowledge
              </Button>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Nothing is charged yet — payment opens once your specialist acknowledges these
                services.
              </p>
            </div>
          ) : unpaid && isClient && !acknowledged ? (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="size-3.5" /> Waiting for {peerFirstName} to acknowledge these
              services.
            </p>
          ) : unpaid && isClient && canPay && message.booking_id ? (
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
                  <CediIcon className="size-3.5" />
                )}
                {dueWithFee ? `Pay ${money(dueWithFee)} into escrow` : "Pay into escrow"}
              </Button>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Ashnight holds the money until you confirm the visit.
              </p>
            </div>
          ) : unpaid && !isClient && ackRequested && !acknowledged && message.booking_id ? (
            <div className="mt-3">
              <Button
                size="sm"
                variant="brass"
                disabled={ackBusy}
                onClick={() => onAcknowledge(message.booking_id!)}
              >
                {ackBusy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="size-3.5" />
                )}
                Acknowledge these services
              </Button>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Check the services above. Once you acknowledge, the member can pay into escrow.
              </p>
            </div>
          ) : unpaid && !isClient && acknowledged ? (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CheckCheck className="size-3.5" /> Acknowledged — waiting for {peerFirstName} to pay
              into escrow.
            </p>
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
      <MessageActions
        mine={mine}
        body={message.body}
        onCopy={() => onCopy(message.body)}
        onReply={() => onReply(message)}
        onReport={onReport}
        attachmentUrl={message.attachment_url}
        onDelete={onDelete}
      >
        <div className="max-w-[85%] select-none">
          <div
            className={cn(
              "text-sm leading-relaxed shadow-sm",
              message.attachment_url ? "rounded-2xl p-1.5" : "rounded-2xl px-4 py-2.5",
              mine
                ? "rounded-tr-none border border-primary/20 bg-primary text-primary-foreground"
                : "rounded-tl-none border border-border/70 bg-card text-foreground",
            )}
          >
            {message.reply_to_id ? (
              <QuotedMessage
                original={repliedTo}
                label={
                  repliedTo
                    ? repliedToMine
                      ? mine
                        ? "You"
                        : peerFirstName
                      : mine
                        ? peerFirstName
                        : "You"
                    : ""
                }
                onSurface={mine ? "primary" : "card"}
                onJump={repliedTo && onJumpTo ? () => onJumpTo(repliedTo.id) : undefined}
                className={message.attachment_url ? "mx-1.5 mt-1.5" : "mb-2"}
              />
            ) : null}
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
      </MessageActions>
    </div>
  );
}

/** One-line summary of a message, used in reply quotes and the composer bar. */
function messagePreview(message: MessageRowType | undefined) {
  if (!message) return "Original message unavailable";
  if (message.kind === "location") return "Location";
  if (message.kind === "gift") return message.body || "Cash gift";
  if (message.kind === "booking") return message.body || "Payment request";
  if (message.body.trim()) return message.body.trim();
  return message.attachment_name ?? "Attachment";
}

/**
 * WhatsApp-style quoted strip. Rendered inside a bubble so both sides see the
 * same reference, and tapping it jumps to the original message.
 */
function QuotedMessage({
  original,
  label,
  onSurface,
  onJump,
  className,
}: {
  original?: MessageRowType | undefined;
  label?: string;
  onSurface: "primary" | "card";
  onJump?: (() => void) | undefined;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={!onJump}
      onClick={(event) => {
        event.stopPropagation();
        onJump?.();
      }}
      className={cn(
        "flex w-full items-stretch gap-2 rounded-lg border-l-2 px-2 py-1.5 text-left",
        onSurface === "primary"
          ? "border-l-primary-foreground/70 bg-primary-foreground/10"
          : "border-l-primary bg-primary/5",
        onJump ? "cursor-pointer" : "cursor-default opacity-80",
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        {label ? (
          <span
            className={cn(
              "block text-[10px] font-semibold uppercase tracking-[0.14em]",
              onSurface === "primary" ? "text-primary-foreground/80" : "text-primary",
            )}
          >
            {label}
          </span>
        ) : null}
        <span
          className={cn(
            "block truncate text-[11px] leading-snug",
            onSurface === "primary" ? "text-primary-foreground/85" : "text-muted-foreground",
          )}
        >
          {messagePreview(original)}
        </span>
      </span>
    </button>
  );
}

/**
 * WhatsApp-style message actions: long-press on touch (or right-click on
 * desktop) opens copy / delete for that single message. Nothing floats beside
 * the bubble, so the transcript stays clean.
 */
function MessageActions({
  mine = false,
  body,
  attachmentUrl,
  onCopy,
  onReply,
  onReport,
  onDelete,
  children,
}: {
  mine?: boolean;
  body: string;
  attachmentUrl?: string | null;
  onCopy: () => void;
  onReply?: () => void;
  onReport?: () => void;
  onDelete?: () => void;
  children: ReactNode;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {onReply ? (
          <ContextMenuItem onSelect={onReply}>
            <Reply className="size-4" /> Reply
          </ContextMenuItem>
        ) : null}
        {body.trim() ? (
          <ContextMenuItem onSelect={onCopy}>
            <Copy className="size-4" /> Copy text
          </ContextMenuItem>
        ) : null}
        {attachmentUrl ? (
          <>
            <ContextMenuItem asChild>
              <a href={attachmentUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" /> Open attachment
              </a>
            </ContextMenuItem>
            <ContextMenuItem asChild>
              <a href={attachmentUrl} download target="_blank" rel="noreferrer">
                <Download className="size-4" /> Save attachment
              </a>
            </ContextMenuItem>
          </>
        ) : null}
        {!mine && onReport ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={onReport}>
              <Flag className="size-4" /> Report message
            </ContextMenuItem>
          </>
        ) : null}
        {onDelete ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={onDelete}
            >
              <Trash2 className="size-4" /> {mine ? "Delete message" : "Delete for me"}
            </ContextMenuItem>
          </>
        ) : null}

        <ContextMenuSeparator />
        <ContextMenuLabel className="truncate text-[11px] font-normal text-muted-foreground">
          {body.slice(0, 40) || "Attachment"}
        </ContextMenuLabel>
      </ContextMenuContent>
    </ContextMenu>
  );
}


/** Emoji tray — sending emoji never depends on the device keyboard. */
const EMOJI_GROUPS: { label: string; emoji: string[] }[] = [
  {
    label: "Smileys",
    emoji: ["😀", "😄", "😅", "😂", "🙂", "😉", "😍", "😘", "😎", "🤗", "🤔", "😐", "😴", "😢", "😭", "😡"],
  },
  {
    label: "Gestures",
    emoji: ["👍", "👎", "👏", "🙏", "🙌", "👌", "✌️", "🤝", "💪", "🫶", "👋", "🤙"],
  },
  {
    label: "Life",
    emoji: ["❤️", "🔥", "✨", "🎉", "💯", "⭐", "🧹", "🧼", "🫧", "🏠", "🕒", "📍", "💰", "🧾", "✅", "❌"],
  },
];

function EmojiPicker({
  onPick,
  extraGroups = [],
}: {
  onPick: (emoji: string) => void;
  extraGroups?: { label: string; emoji: string[] }[];
}) {
  const [open, setOpen] = useState(false);
  const groups = [...extraGroups, ...EMOJI_GROUPS];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 rounded-full text-muted-foreground"
          aria-label="Insert emoji"
        >
          <Smile className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="max-h-80 w-72 overflow-y-auto p-3">
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="eyebrow mb-1.5">{group.label}</p>
              <div className="flex flex-wrap gap-1">
                {group.emoji.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="flex size-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-secondary"
                    onClick={() => onPick(emoji)}
                    aria-label={`Insert ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
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
