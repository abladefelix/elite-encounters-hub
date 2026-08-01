import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Check, MessageSquareWarning, Plus, ShieldBan, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TIERS, useRoomSettings } from "@/lib/room-settings";
import {
  FINDING_LABEL,
  MODERATION_ACTIONS,
  moderateMessage,
  useModerationLog,
  type ModerationAction,
} from "@/lib/moderation";
import { relativeTime } from "@/lib/escrow";
import { tierLabel } from "@/lib/types";
import {
  REPORT_REASON_LABEL,
  useRatings,
  useReports,
  type ReportStatus,
} from "@/lib/reports";


export const Route = createFileRoute("/ashnight-control/moderation")({
  head: () => ({
    meta: [
      { title: "Chat Moderation & Word Filters | Ashnight Admin" },
      {
        name: "description",
        content:
          "Flag words, block phone numbers, emails and links in Ashnight chat, choose per-room exemptions and review every moderation hit.",
      },
      { property: "og:title", content: "Chat Moderation & Word Filters | Ashnight Admin" },
      {
        property: "og:description",
        content:
          "Word filters, contact-sharing blocks, per-room exemptions and a full review log.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminModeration,
});

function AdminModeration() {
  const {
    moderation,
    setModerationField,
    setFlaggedWords,
    addFlaggedWord,
    removeFlaggedWord,
    setContactExemptRoom,
    profiles,
  } = useRoomSettings();
  const { hits, markReviewed, remove, clear } = useModerationLog();
  const { reports, setStatus, remove: removeReport } = useReports();
  const { ratings } = useRatings();


  const [newWord, setNewWord] = useState("");
  const [bulk, setBulk] = useState("");
  const [test, setTest] = useState("Call me on 024 555 1234 or mail me at me@example.com — cash only.");

  const verdict = useMemo(
    () => moderateMessage(test, moderation, "basic"),
    [test, moderation],
  );

  const open = hits.filter((hit) => !hit.reviewed).length;

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow text-primary">Trust &amp; safety</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Chat moderation
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Decide which words Ashnight flags, and whether members may exchange phone numbers,
          emails, links or social handles. Every rule applies the moment a member hits send.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Flagged words" value={String(moderation.flaggedWords.length)} icon={MessageSquareWarning} />
        <Stat label="Hits awaiting review" value={String(open)} icon={AlertTriangle} />
        <Stat
          label="Phone numbers"
          value={moderation.blockPhoneNumbers ? "Blocked" : "Allowed"}
          icon={ShieldBan}
        />
      </div>

      {/* -------------------------------------------------------- master rules */}
      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold tracking-tight">Rules</h2>
        <div className="mt-4 space-y-4">
          <Row
            label="Moderation engine"
            hint="Master switch. Off means nothing is filtered or logged."
          >
            <Switch
              checked={moderation.enabled}
              onCheckedChange={(value) => setModerationField("enabled", value)}
              aria-label="Moderation engine"
            />
          </Row>
          <Separator />
          <Row
            label="Prevent phone numbers"
            hint="Catches digits, spaced or dashed numbers, spelled-out digits (“zero two four…”) and “WhatsApp me 024…” handoffs. Blocks the send by default."
          >
            <div className="flex items-center gap-3">
              <ActionSelect
                value={moderation.phoneAction}
                onChange={(value) => setModerationField("phoneAction", value)}
                disabled={!moderation.blockPhoneNumbers}
              />
              <Switch
                checked={moderation.blockPhoneNumbers}
                onCheckedChange={(value) => setModerationField("blockPhoneNumbers", value)}
                aria-label="Prevent phone numbers"
              />
            </div>
          </Row>
          <Row
            label="Prevent other contact sharing"
            hint="Emails, external links and social handles."
          >
            <div className="flex items-center gap-3">
              <ActionSelect
                value={moderation.contactAction}
                onChange={(value) => setModerationField("contactAction", value)}
                disabled={!moderation.blockContactSharing}
              />
              <Switch
                checked={moderation.blockContactSharing}
                onCheckedChange={(value) => setModerationField("blockContactSharing", value)}
                aria-label="Prevent other contact sharing"
              />
            </div>
          </Row>
          <Row label="Flagged words" hint="Act on the word list below.">
            <div className="flex items-center gap-3">
              <ActionSelect
                value={moderation.flaggedWordsAction}
                onChange={(value) => setModerationField("flaggedWordsAction", value)}
                disabled={!moderation.flaggedWordsEnabled}
              />
              <Switch
                checked={moderation.flaggedWordsEnabled}
                onCheckedChange={(value) => setModerationField("flaggedWordsEnabled", value)}
                aria-label="Flagged words"
              />
            </div>
          </Row>
          <Separator />
          <Row
            label="Tell the member"
            hint="Post a system note in the thread when a message is blocked."
          >
            <Switch
              checked={moderation.notifyMember}
              onCheckedChange={(value) => setModerationField("notifyMember", value)}
              aria-label="Tell the member"
            />
          </Row>
          <Row label="Log hits for review" hint="Write every match to the review log below.">
            <Switch
              checked={moderation.logHits}
              onCheckedChange={(value) => setModerationField("logHits", value)}
              aria-label="Log hits for review"
            />
          </Row>
        </div>
      </Card>

      {/* -------------------------------------------------------- per-room */}
      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Contact sharing by room
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Exempt a room if those members are trusted to swap details directly — everyone else stays
          on-platform.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-panel px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{profiles[tier]?.name ?? tierLabel(tier)}</p>
                <p className="text-xs text-muted-foreground">
                  {moderation.contactExemptRooms[tier] ? "May share contacts" : "Contacts blocked"}
                </p>
              </div>
              <Switch
                checked={moderation.contactExemptRooms[tier]}
                onCheckedChange={(value) => setContactExemptRoom(tier, value)}
                aria-label={`Allow contact sharing in ${tierLabel(tier)}`}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* -------------------------------------------------------- word list */}
      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold tracking-tight">Flagged word list</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Words and phrases are matched case-insensitively as whole terms.
        </p>

        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const term = newWord.trim();
            if (!term) return;
            addFlaggedWord(term);
            setNewWord("");
            toast.success(`“${term}” added to the flag list`);
          }}
        >
          <Input
            value={newWord}
            onChange={(event) => setNewWord(event.target.value)}
            placeholder="Add a word or phrase…"
            maxLength={60}
          />
          <Button type="submit" variant="soft">
            <Plus className="size-4" /> Add
          </Button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          {moderation.flaggedWords.length ? (
            moderation.flaggedWords.map((word) => (
              <Badge key={word} variant="outline" className="gap-1.5 py-1 pr-1.5 text-xs">
                {word}
                <button
                  type="button"
                  aria-label={`Remove ${word}`}
                  className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  onClick={() => removeFlaggedWord(word)}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No words flagged yet.</p>
          )}
        </div>

        <Separator className="my-5" />

        <Label htmlFor="bulk-words" className="text-sm">
          Bulk replace (one term per line)
        </Label>
        <Textarea
          id="bulk-words"
          value={bulk}
          onChange={(event) => setBulk(event.target.value)}
          placeholder={moderation.flaggedWords.join("\n")}
          rows={4}
          className="mt-2"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="soft"
            onClick={() => {
              setFlaggedWords(bulk.split(/[\n,]/));
              toast.success("Flag list replaced");
            }}
            disabled={!bulk.trim()}
          >
            Replace list
          </Button>
          <Button variant="ghost" onClick={() => setBulk(moderation.flaggedWords.join("\n"))}>
            Load current list
          </Button>
        </div>
      </Card>

      {/* -------------------------------------------------------- tester */}
      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold tracking-tight">Rule tester</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a message to see exactly what a member would experience.
        </p>
        <Textarea
          value={test}
          onChange={(event) => setTest(event.target.value)}
          rows={3}
          className="mt-3"
        />
        <div className="mt-3 space-y-2 rounded-lg border border-border/70 bg-panel px-4 py-3 text-sm">
          <p>
            Outcome:{" "}
            <span
              className={
                verdict.action === "block"
                  ? "font-medium text-destructive"
                  : verdict.action === "mask"
                    ? "font-medium text-primary"
                    : "font-medium text-success"
              }
            >
              {verdict.action === "block"
                ? "Blocked"
                : verdict.action === "mask"
                  ? "Delivered, redacted"
                  : verdict.findings.length
                    ? "Delivered, flagged"
                    : "Clean"}
            </span>
          </p>
          {verdict.findings.length ? (
            <p className="text-muted-foreground">
              Matches:{" "}
              {verdict.findings
                .map((finding) => `${FINDING_LABEL[finding.kind]} — “${finding.match}”`)
                .join("; ")}
            </p>
          ) : null}
          <p className="text-muted-foreground">Delivered as: {verdict.body}</p>
        </div>
      </Card>

      {/* --------------------------------------------------- member reports */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">Member reports</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Reports raised from the chat thread, newest first.{" "}
              {reports.filter((report) => report.status === "open").length} awaiting triage.
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {reports.length ? (
            reports.map((report) => (
              <div
                key={report.id}
                className="rounded-lg border border-border/70 bg-background/50 p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="soft" className="rounded-full font-normal">
                    {REPORT_REASON_LABEL[report.reason]}
                  </Badge>
                  <Badge
                    variant={report.status === "open" ? "destructive" : "secondary"}
                    className="rounded-full font-normal capitalize"
                  >
                    {report.status}
                  </Badge>
                  {report.blocked ? (
                    <Badge variant="outline" className="rounded-full font-normal">
                      Member blocked
                    </Badge>
                  ) : null}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {tierLabel(report.room)} · {relativeTime(report.at)}
                  </span>
                </div>
                <p className="mt-2">
                  <span className="font-medium">{report.reportedName}</span> reported in thread{" "}
                  {report.threadId}
                </p>
                {report.details ? (
                  <p className="mt-1 text-muted-foreground">{report.details}</p>
                ) : null}
                {report.excerpt ? (
                  <p className="mt-1 text-xs text-muted-foreground">Thread: {report.excerpt}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["reviewing", "actioned", "dismissed"] as ReportStatus[]).map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={report.status === status ? "soft" : "ghost"}
                      onClick={() => {
                        setStatus(report.id, status);
                        toast.success(`Report marked ${status}`);
                      }}
                      className="capitalize"
                    >
                      {status === "actioned" ? <Check className="size-3.5" /> : null}
                      {status}
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => removeReport(report.id)}>
                    <Trash2 className="size-3.5" /> Delete
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No reports yet.</p>
          )}
        </div>
      </Card>

      {/* -------------------------------------------------------- chat ratings */}
      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold tracking-tight">Chat star ratings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ratings members posted from their threads.
        </p>
        <div className="mt-4 space-y-2">
          {ratings.length ? (
            ratings.map((rating) => (
              <div
                key={rating.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-background/50 p-3 text-sm"
              >
                <span className="font-medium">{rating.specialistName}</span>
                <Badge variant="soft" className="rounded-full font-normal">
                  {rating.stars}/5
                </Badge>
                {rating.tags.length ? (
                  <span className="text-xs text-muted-foreground">{rating.tags.join(" · ")}</span>
                ) : null}
                {rating.note ? (
                  <span className="text-muted-foreground">“{rating.note}”</span>
                ) : null}
                <span className="ml-auto text-xs text-muted-foreground">
                  {relativeTime(rating.at)}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No ratings yet.</p>
          )}
        </div>
      </Card>

      {/* -------------------------------------------------------- review log */}

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">Review log</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Every message that tripped a rule, newest first.
            </p>
          </div>
          <Button variant="ghost" onClick={clear} disabled={!hits.length}>
            <Trash2 className="size-4" /> Clear log
          </Button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Thread</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead className="text-right">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hits.length ? (
                hits.map((hit) => (
                  <TableRow key={hit.id} className={hit.reviewed ? "opacity-60" : undefined}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {relativeTime(hit.at)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{hit.threadLabel}</TableCell>
                    <TableCell className="whitespace-nowrap">{tierLabel(hit.room)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {hit.kinds.map((kind) => FINDING_LABEL[kind]).join(", ")}
                    </TableCell>
                    <TableCell className="max-w-[22rem] truncate text-muted-foreground">
                      {hit.excerpt}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {hit.action === "block"
                        ? "Blocked"
                        : hit.action === "mask"
                          ? "Redacted"
                          : "Flagged"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Mark reviewed"
                          onClick={() => markReviewed(hit.id, !hit.reviewed)}
                        >
                          <Check className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete entry"
                          onClick={() => remove(hit.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Nothing flagged yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function ActionSelect({
  value,
  onChange,
  disabled,
}: {
  value: ModerationAction;
  onChange: (value: ModerationAction) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as ModerationAction)}>
      <SelectTrigger className="w-[9.5rem]" disabled={disabled} aria-label="Action">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MODERATION_ACTIONS.map((action) => (
          <SelectItem key={action.id} value={action.id}>
            {action.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="max-w-lg">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof ShieldBan;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <p className="text-xs uppercase tracking-[0.16em]">{label}</p>
      </div>
      <p className="mt-2 font-display text-xl font-semibold tracking-tight">{value}</p>
    </Card>
  );
}
