import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  FileSearch,
  Film,
  Image as ImageIcon,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataPager, usePaged } from "@/components/ui/data-pager";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TierBadge } from "@/components/tier-badge";
import {
  useAllProfiles,
  useApplications,
  useReviewApplication,
  useStoredMedia,
  useUpdateProfile,
  type ApplicationRow,
  type ProfileFullRow,
} from "@/lib/queries";
import { money, type Tier } from "@/lib/types";
import type { Database } from "@/integrations/supabase/types";

type VettingStatus = Database["public"]["Enums"]["vetting_status"];

export const Route = createFileRoute("/ashnight-control/vetting")({
  head: () => ({
    meta: [
      { title: "Vetting Queue | Ashnight Admin" },
      {
        name: "description",
        content:
          "Review Ashnight applicants: identity checks, background results, references, and the room each approved member should be placed into.",
      },
      { property: "og:title", content: "Vetting Queue | Ashnight Admin" },
      {
        property: "og:description",
        content: "Approve, hold or decline applicants and assign their room placement.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VettingQueue,
});

const FILTERS: { value: VettingStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_review", label: "In review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Declined" },
];

function VettingQueue() {
  const applicationsQuery = useApplications();
  const profilesQuery = useAllProfiles();
  const review = useReviewApplication();
  const updateProfile = useUpdateProfile();

  const rows = applicationsQuery.data ?? [];
  const profiles = profilesQuery.data ?? [];

  const [filter, setFilter] = useState<VettingStatus | "all">("pending");
  const [selectedId, setSelectedId] = useState<string>("");
  const [room, setRoom] = useState<Tier>("basic");
  const [note, setNote] = useState("");

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((row) => row.status === filter)),
    [rows, filter],
  );

  const paged = usePaged(visible, 10);

  /**
   * The open applicant must always belong to the tab being viewed — otherwise
   * switching to "In review" kept a pending applicant open and the panel still
   * offered "Start review".
   */
  const selected: ApplicationRow | undefined =
    visible.find((row) => row.id === selectedId) ?? visible[0];

  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected.id);
    setRoom(selected.suggested_room);
    setNote(selected.admin_note ?? "");
  }, [selected?.id]);


  const profile: ProfileFullRow | undefined = selected?.user_id
    ? profiles.find((row) => row.id === selected.user_id)
    : undefined;

  async function decide(applicant: ApplicationRow, status: VettingStatus) {
    try {
      await review.mutateAsync({
        id: applicant.id,
        patch: {
          status,
          suggested_room: room,
          admin_note: note,
          reviewed_at: new Date().toISOString(),
        },
      });

      if (applicant.user_id) {
        if (status === "approved") {
          await updateProfile.mutateAsync({
            id: applicant.user_id,
            patch: {
              vetting: "approved",
              room,
              account_status: "active",
              status_reason: "Approved through vetting review",
              status_changed_at: new Date().toISOString(),
            },
          });
        } else if (status === "rejected") {
          await updateProfile.mutateAsync({
            id: applicant.user_id,
            patch: {
              vetting: "rejected",
              account_status: "deactivated",
              status_reason: note || "Application declined at vetting",
              status_changed_at: new Date().toISOString(),
            },
          });
        } else {
          await updateProfile.mutateAsync({
            id: applicant.user_id,
            patch: { vetting: "in_review" },
          });
        }
      }

      // Follow the applicant into their new stage so the reviewer keeps context
      // instead of silently landing on the next pending application.
      setFilter(status);
      setSelectedId(applicant.id);


      if (status === "approved") {
        toast.success(`${applicant.full_name} approved into the ${room} room`);
      } else if (status === "rejected") {
        toast(`${applicant.full_name} declined`);
      } else {
        toast(`${applicant.full_name} moved to in review`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the decision");
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow text-primary">Trust &amp; safety</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Vetting queue
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Nobody reaches the platform without a human decision here. Pick an applicant to read
          their full submission, then approve them into a room.
        </p>
      </header>

      <Tabs value={filter} onValueChange={(value) => setFilter(value as VettingStatus | "all")}>
        <TabsList>
          {FILTERS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
              {item.value !== "all" ? (
                <span className="ml-1.5 text-[10px] text-muted-foreground">
                  {rows.filter((row) => row.status === item.value).length}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="divide-y divide-border/60 p-0">
          {applicationsQuery.isLoading ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Loading applicants…</p>
          ) : visible.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nothing in this bucket.
            </p>
          ) : (
            paged.rows.map((applicant) => (
              <button
                key={applicant.id}
                onClick={() => setSelectedId(applicant.id)}
                className={`flex w-full flex-wrap items-center gap-3 p-4 text-left transition-colors hover:bg-secondary/50 ${
                  applicant.id === selected?.id ? "bg-secondary/70" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{applicant.full_name}</p>
                    <StatusBadge status={applicant.status} />
                  </div>
                  <p className="mt-1 text-xs capitalize text-muted-foreground">
                    {applicant.applied_role} · {applicant.city} · applied{" "}
                    {new Date(applicant.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <CheckPill ok={applicant.id_verified} label="ID" />
                  <CheckPill
                    ok={applicant.background_check === "clear"}
                    warn={applicant.background_check === "flagged"}
                    label="BGC"
                  />
                  <TierBadge tier={applicant.suggested_room} />
                </div>
              </button>
            ))
          )}
        </Card>

        {selected ? (
          <Card className="h-fit p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">{selected.full_name}</h2>
                <p className="mt-1 text-xs capitalize text-muted-foreground">
                  {selected.applied_role} applicant · {selected.city}
                </p>
              </div>
              <StatusBadge status={selected.status} />
            </div>

            <Separator className="my-5" />

            <div className="space-y-2 text-sm">
              <ContactLine icon={Mail} value={selected.email} />
              <ContactLine icon={Phone} value={selected.phone || "No phone supplied"} />
              <ContactLine
                icon={MapPin}
                value={
                  profile
                    ? [profile.address, profile.locality, selected.city]
                        .filter(Boolean)
                        .join(", ") || selected.city
                    : selected.city
                }
              />
              <ContactLine
                icon={User}
                value={
                  profile?.username
                    ? `@${profile.username}`
                    : selected.user_id
                      ? "Account linked"
                      : "No account linked yet"
                }
              />
            </div>

            <Separator className="my-5" />

            <dl className="space-y-3 text-sm">
              <Row label="Identity verified" value={selected.id_verified ? "Yes" : "Not yet"} />
              <Row
                label="Background check"
                value={
                  selected.background_check === "clear"
                    ? "Clear"
                    : selected.background_check === "flagged"
                      ? "Flagged — review"
                      : "Pending"
                }
              />
              <Row
                label="Reference checks"
                value={`${selected.reference_checks} of 3 complete`}
              />
              <Row label="Experience" value={`${selected.years_experience} year(s)`} />
              <Row
                label="Applied"
                value={new Date(selected.created_at).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              />
              {profile ? (
                <>
                  <Row
                    label="Ghana Card"
                    value={profile.ghana_card_number ?? "Not provided"}
                  />
                  <Row
                    label="Card expiry"
                    value={
                      profile.ghana_card_expiry
                        ? new Date(profile.ghana_card_expiry).toLocaleDateString("en-US")
                        : "—"
                    }
                  />
                  <Row label="Hourly rate" value={money(profile.hourly_rate)} />
                  <Row label="Account status" value={profile.account_status} />
                  <Row label="Username" value={profile.username ? `@${profile.username}` : "—"} />
                  <Row label="Phone on profile" value={profile.phone || "—"} />
                  <Row label="Address" value={profile.address || "—"} />
                  <Row label="Locality" value={profile.locality || "—"} />
                  <Row label="Headline" value={profile.headline || "—"} />
                  <Row label="Room" value={profile.room ?? "Not placed"} />
                  <Row
                    label="Languages"
                    value={profile.languages?.length ? profile.languages.join(", ") : "—"}
                  />
                  <Row
                    label="Likes"
                    value={profile.likes?.length ? profile.likes.join(", ") : "—"}
                  />
                  <Row
                    label="Dislikes"
                    value={profile.dislikes?.length ? profile.dislikes.join(", ") : "—"}
                  />
                  <Row
                    label="Reply time"
                    value={`${profile.response_minutes} min average`}
                  />
                  <Row label="Available now" value={profile.available ? "Yes" : "No"} />
                  <Row label="Verified badge" value={profile.verified ? "Yes" : "No"} />
                  <Row
                    label="Terms accepted"
                    value={
                      profile.terms_accepted_at
                        ? new Date(profile.terms_accepted_at).toLocaleString("en-US")
                        : "Not accepted"
                    }
                  />
                  <Row
                    label="Privacy accepted"
                    value={
                      profile.privacy_accepted_at
                        ? new Date(profile.privacy_accepted_at).toLocaleString("en-US")
                        : "Not accepted"
                    }
                  />
                </>
              ) : null}
            </dl>

            {profile ? <ExtraFields extra={profile.extra} /> : null}

            {profile ? <ApplicantMedia profile={profile} /> : null}


            <div className="mt-5 rounded-lg border border-border bg-panel p-4">
              <p className="flex items-center gap-2 text-xs font-medium">
                <FileSearch className="size-3.5 text-primary" /> Applicant pitch
              </p>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {selected.pitch || "No pitch submitted."}
              </p>
              {profile?.bio ? (
                <>
                  <p className="mt-4 text-xs font-medium">Profile bio</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                    {profile.bio}
                  </p>
                </>
              ) : null}
            </div>

            <div className="mt-5">
              <label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Reviewer note
              </label>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="What did you verify? Kept on the application record."
                className="mt-2 min-h-20 text-sm"
              />
            </div>

            <div className="mt-5">
              <label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Room placement
              </label>
              <Select value={room} onValueChange={(value) => setRoom(value as Tier)}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic room</SelectItem>
                  <SelectItem value="premium">Premium room</SelectItem>
                  <SelectItem value="ultimate">Ultimate room</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                {selected.applied_role === "specialist"
                  ? "Specialists are placed on experience, references and rating history."
                  : "Members are placed by the membership they purchased — override only with a reason."}
              </p>
            </div>

            <div className="mt-6 space-y-3">
              <StageTrail status={selected.status} />
              {selected.status === "pending" ? (
                <>
                  <Button
                    variant="brass"
                    className="w-full"
                    disabled={review.isPending}
                    onClick={() => void decide(selected, "in_review")}
                  >
                    <ShieldAlert className="size-4" /> Start review
                  </Button>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Applicants move pending → in review → approved or declined. Start the review to
                    unlock the approve and decline decisions.
                  </p>
                  <Button
                    variant="ghost"
                    className="w-full"
                    disabled={review.isPending}
                    onClick={() => void decide(selected, "rejected")}
                  >
                    <X className="size-4" /> Decline without review
                  </Button>
                </>
              ) : selected.status === "in_review" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    variant="brass"
                    disabled={review.isPending}
                    onClick={() => void decide(selected, "approved")}
                  >
                    <Check className="size-4" /> Approve
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={review.isPending}
                    onClick={() => void decide(selected, "rejected")}
                  >
                    <X className="size-4" /> Decline
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    This application is {selected.status === "approved" ? "approved" : "declined"}.
                    Reopen it to change the decision.
                  </p>
                  <Button
                    variant="secondary"
                    className="w-full"
                    disabled={review.isPending}
                    onClick={() => void decide(selected, "in_review")}
                  >
                    <ShieldAlert className="size-4" /> Reopen review
                  </Button>
                </>
              )}
            </div>

          </Card>
        ) : (
          <Card className="h-fit p-6 text-sm text-muted-foreground">
            No applications submitted yet.
          </Card>
        )}
      </div>
    </div>
  );
}

/**
 * Everything the applicant uploaded — profile photo, Ghana Card scans, work
 * photos and the intro video — resolved into viewable links for the reviewer.
 */
function ApplicantMedia({ profile }: { profile: ProfileFullRow }) {
  const extra = (profile.extra ?? {}) as Record<string, unknown>;
  const rawPhotos = extra["portfolio_photos"];
  const rawVideo = extra["portfolio_video"];
  const portfolioPhotos = Array.isArray(rawPhotos)
    ? (rawPhotos as unknown[]).filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      )
    : [];
  const portfolioVideo = typeof rawVideo === "string" && rawVideo ? rawVideo : null;

  const items = [
    ...(profile.avatar_url ? [{ bucket: "avatars" as const, value: profile.avatar_url }] : []),
    ...(profile.ghana_card_front_url
      ? [{ bucket: "avatars" as const, value: profile.ghana_card_front_url }]
      : []),
    ...(profile.ghana_card_back_url
      ? [{ bucket: "avatars" as const, value: profile.ghana_card_back_url }]
      : []),
    ...portfolioPhotos.map((value) => ({ bucket: "attachments" as const, value })),
    ...(portfolioVideo ? [{ bucket: "attachments" as const, value: portfolioVideo }] : []),
  ];

  const mediaQuery = useStoredMedia(items);
  const urls = mediaQuery.data ?? {};

  if (items.length === 0) {
    return (
      <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
        This applicant has not uploaded a profile photo, ID scans or portfolio media yet.
      </p>
    );
  }

  const avatar = profile.avatar_url ? urls[profile.avatar_url] : undefined;
  const cardFront = profile.ghana_card_front_url ? urls[profile.ghana_card_front_url] : undefined;
  const cardBack = profile.ghana_card_back_url ? urls[profile.ghana_card_back_url] : undefined;
  const videoUrl = portfolioVideo ? urls[portfolioVideo] : undefined;

  return (
    <div className="mt-5 space-y-4">
      <p className="flex items-center gap-2 text-xs font-medium">
        <ImageIcon className="size-3.5 text-primary" /> Uploaded media
      </p>

      {mediaQuery.isLoading ? (
        <p className="text-xs text-muted-foreground">Preparing uploads…</p>
      ) : null}

      {avatar ? (
        <div className="flex items-center gap-3">
          <a href={avatar} target="_blank" rel="noreferrer">
            <img
              src={avatar}
              alt={`${profile.display_name} profile photo`}
              className="size-16 rounded-full border border-border object-cover"
            />
          </a>
          <p className="text-xs text-muted-foreground">Profile photo — click to open full size</p>
        </div>
      ) : null}

      {cardFront || cardBack ? (
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Ghana Card
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[
              { url: cardFront, label: "Front" },
              { url: cardBack, label: "Back" },
            ]
              .filter((item) => Boolean(item.url))
              .map((item) => (
                <a
                  key={item.label}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group overflow-hidden rounded-lg border border-border"
                >
                  <img
                    src={item.url}
                    alt={`Ghana Card ${item.label.toLowerCase()}`}
                    className="h-24 w-full object-cover transition-transform group-hover:scale-105"
                  />
                  <span className="block bg-panel p-1.5 text-center text-[10px] text-muted-foreground">
                    {item.label}
                  </span>
                </a>
              ))}
          </div>
        </div>
      ) : null}

      {portfolioPhotos.length ? (
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Work photos ({portfolioPhotos.length})
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {portfolioPhotos.map((path, index) =>
              urls[path] ? (
                <a
                  key={path}
                  href={urls[path]}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-lg border border-border"
                >
                  <img
                    src={urls[path]}
                    alt={`Portfolio photo ${index + 1}`}
                    className="h-20 w-full object-cover"
                  />
                </a>
              ) : null,
            )}
          </div>
        </div>
      ) : null}

      {videoUrl ? (
        <div>
          <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            <Film className="size-3.5" /> Intro video
          </p>
          <video src={videoUrl} controls className="mt-2 w-full rounded-lg border border-border" />
        </div>
      ) : null}
    </div>
  );
}

/** Renders every custom sign-up field the applicant filled in. */
function ExtraFields({ extra }: { extra: ProfileFullRow["extra"] }) {
  const record = (extra ?? {}) as Record<string, unknown>;
  const entries = Object.entries(record).filter(
    ([key, value]) =>
      key !== "portfolio_photos" &&
      key !== "portfolio_video" &&
      value !== null &&
      value !== undefined &&
      value !== "",
  );
  if (entries.length === 0) return null;

  return (
    <div className="mt-5 rounded-lg border border-border bg-panel p-4">
      <p className="text-xs font-medium">Other submitted fields</p>
      <dl className="mt-3 space-y-2 text-xs">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-start justify-between gap-3">
            <dt className="capitalize text-muted-foreground">{key.replace(/[_-]+/g, " ")}</dt>
            <dd className="max-w-[60%] break-words text-right font-medium">
              {typeof value === "boolean"
                ? value
                  ? "Yes"
                  : "No"
                : Array.isArray(value)
                  ? value.join(", ")
                  : typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Shows where the applicant sits in the pending → review → decision flow. */
function StageTrail({ status }: { status: VettingStatus }) {
  const steps: { key: VettingStatus; label: string }[] = [
    { key: "pending", label: "Pending" },
    { key: "in_review", label: "In review" },
    { key: status === "rejected" ? "rejected" : "approved", label: status === "rejected" ? "Declined" : "Approved" },
  ];
  const index = status === "pending" ? 0 : status === "in_review" ? 1 : 2;

  return (
    <div className="flex items-center gap-2 text-[11px]">
      {steps.map((step, i) => (
        <div key={step.key} className="flex items-center gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 ${
              i <= index
                ? status === "rejected" && i === 2
                  ? "border-destructive/40 text-destructive"
                  : "border-primary/40 text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            {step.label}
          </span>
          {i < steps.length - 1 ? <span className="text-muted-foreground">→</span> : null}
        </div>
      ))}
    </div>
  );
}

function ContactLine({

  icon: Icon,
  value,
}: {
  icon: typeof Mail;
  value: string;
}) {
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon className="size-3.5 shrink-0 text-primary" />
      <span className="break-all">{value}</span>
    </p>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium capitalize">{value}</dd>
    </div>
  );
}

function CheckPill({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) {
  return (
    <span
      className={`hidden items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] sm:inline-flex ${
        warn
          ? "border-destructive/40 text-destructive"
          : ok
            ? "border-success/40 text-success"
            : "border-border text-muted-foreground"
      }`}
    >
      <ShieldCheck className="size-3" />
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: VettingStatus }) {
  const map: Record<VettingStatus, { label: string; className: string }> = {
    pending: { label: "Pending", className: "border-border text-muted-foreground" },
    in_review: { label: "In review", className: "border-warning/40 text-warning" },
    approved: { label: "Approved", className: "border-success/40 text-success" },
    rejected: { label: "Declined", className: "border-destructive/40 text-destructive" },
  };
  const item = map[status];
  return (
    <Badge variant="outline" className={`shrink-0 text-[10px] ${item.className}`}>
      {item.label}
    </Badge>
  );
}
