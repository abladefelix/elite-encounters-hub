/**
 * One dialog for both hand-creating an account and editing every aspect of an
 * existing one: identity, contact, specialist profile, placement, credentials
 * and roles.
 */
import { useEffect, useRef, useState } from "react";
import { Film, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";


import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createUserAccount,
  getUserAccount,
  updateUserAccount,
} from "@/lib/admin-users.functions";
import { ACCOUNT_STATUSES, ACCOUNT_STATUS_META } from "@/lib/account-status";
import {
  resolveStoredMedia,
  uploadAvatar,
  uploadPortfolioFile,
  useStoredMedia,
  type ProfileFullRow,
} from "@/lib/queries";


type AppRole = "client" | "specialist" | "admin";

const VETTING = ["pending", "in_review", "approved", "rejected"] as const;
const ROOMS = ["basic", "premium", "ultimate"] as const;

interface FormState {
  email: string;
  password: string;
  roles: AppRole[];
  display_name: string;
  username: string;
  phone: string;
  city: string;
  address: string;
  locality: string;
  headline: string;
  bio: string;
  avatar_url: string;
  hourly_rate: string;
  years_experience: string;
  response_minutes: string;
  jobs_completed: string;
  languages: string;
  likes: string;
  dislikes: string;
  room: string;
  vetting: string;
  account_status: string;
  status_reason: string;
  ghana_card_number: string;
  ghana_card_expiry: string;
  verified: boolean;
  available: boolean;
  suspended: boolean;
  portfolio_photos: string[];
  portfolio_video: string | null;

}

const EMPTY: FormState = {
  email: "",
  password: "",
  roles: ["client"],
  display_name: "",
  username: "",
  phone: "",
  city: "",
  address: "",
  locality: "",
  headline: "",
  bio: "",
  avatar_url: "",
  hourly_rate: "0",
  years_experience: "0",
  response_minutes: "15",
  jobs_completed: "0",
  languages: "",
  likes: "",
  dislikes: "",
  room: "none",
  vetting: "pending",
  account_status: "active",
  status_reason: "",
  ghana_card_number: "",
  ghana_card_expiry: "",
  verified: false,
  available: true,
  suspended: false,
};

function fromProfile(profile: ProfileFullRow): FormState {
  return {
    ...EMPTY,
    display_name: profile.display_name ?? "",
    username: profile.username ?? "",
    phone: profile.phone ?? "",
    city: profile.city ?? "",
    address: profile.address ?? "",
    locality: profile.locality ?? "",
    headline: profile.headline ?? "",
    bio: profile.bio ?? "",
    avatar_url: profile.avatar_url ?? "",
    hourly_rate: String(profile.hourly_rate ?? 0),
    years_experience: String(profile.years_experience ?? 0),
    response_minutes: String(profile.response_minutes ?? 15),
    jobs_completed: String(profile.jobs_completed ?? 0),
    languages: (profile.languages ?? []).join(", "),
    likes: (profile.likes ?? []).join(", "),
    dislikes: (profile.dislikes ?? []).join(", "),
    room: profile.room ?? "none",
    vetting: profile.vetting ?? "pending",
    account_status: profile.account_status ?? "active",
    status_reason: profile.status_reason ?? "",
    ghana_card_number: profile.ghana_card_number ?? "",
    ghana_card_expiry: profile.ghana_card_expiry ?? "",
    verified: Boolean(profile.verified),
    available: Boolean(profile.available),
    suspended: Boolean(profile.suspended),
  };
}

/**
 * Profile picture control: shows the current picture, uploads a replacement to
 * the private avatar store on the member's behalf, or clears it. Falls back to
 * a plain link field so an external URL can still be pasted.
 */
function AvatarField({
  userId,
  value,
  name,
  onChange,
}: {
  userId?: string | undefined;
  value: string;
  name: string;
  onChange: (next: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setPreviewError(false);
    if (!value) {
      setPreview(null);
      setLoadingPreview(false);
      return;
    }
    setLoadingPreview(true);
    resolveStoredMedia("avatars", value)
      .then((url) => {
        if (!active) return;
        setPreview(url);
        setLoadingPreview(false);
      })
      .catch(() => {
        if (!active) return;
        setPreview(null);
        setPreviewError(true);
        setLoadingPreview(false);
      });
    return () => {
      active = false;
    };
  }, [value]);


  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!userId) {
      toast.error("Save the account first, then add a profile picture.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Pick an image file — PNG, JPG or WebP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("That image is larger than 8MB. Pick a smaller file.");
      return;
    }
    setBusy(true);
    try {
      onChange(await uploadAvatar(userId, file));
      toast.success("Picture uploaded — save to apply it.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-4 rounded-lg border border-border bg-panel p-3">
        <div className="space-y-1 text-center">
          <Avatar className="h-24 w-24 border border-border">
            {preview ? <AvatarImage src={preview} alt={name || "Member"} /> : null}
            <AvatarFallback className="text-lg">
              {(name || "?").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {value ? "Current picture" : "No picture"}
          </p>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          {loadingPreview ? (
            <p className="text-xs text-muted-foreground">Loading current picture…</p>
          ) : previewError ? (
            <p className="text-xs text-destructive">
              Stored picture could not be loaded — you can still replace it.
            </p>
          ) : preview ? (
            <a
              href={preview}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary underline"
            >
              Open full size
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">
              This member has not set a profile picture.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="mr-2 h-4 w-4" />
              )}
              {value ? "Replace picture" : "Upload picture"}
            </Button>
            {value ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => onChange("")}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove
              </Button>
            ) : null}
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
      </div>

      <Input
        id="ue-avatar"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Or paste an image URL"
      />
      {!userId ? (
        <p className="text-xs text-muted-foreground">
          Uploads become available once the account exists — create it first, then reopen the editor.
        </p>
      ) : null}
    </div>
  );
}

const MAX_PORTFOLIO_PHOTOS = 6;

/**
 * Specialist-only media: several work photos plus one intro video, both stored
 * privately under the member's own folder. Clients never get this section —
 * they carry a single profile picture and no video.
 */
function PortfolioField({
  userId,
  photos,
  video,
  onPhotosChange,
  onVideoChange,
}: {
  userId?: string | undefined;
  photos: string[];
  video: string | null;
  onPhotosChange: (next: string[]) => void;
  onVideoChange: (next: string | null) => void;
}) {
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const items = [
    ...photos.map((value) => ({ bucket: "attachments" as const, value })),
    ...(video ? [{ bucket: "attachments" as const, value: video }] : []),
  ];
  const mediaQuery = useStoredMedia(items);
  const urls = mediaQuery.data ?? {};

  async function upload(files: File[], kind: "photo" | "video") {
    if (!files.length) return;
    if (!userId) {
      toast.error("Save the account first, then add portfolio media.");
      return;
    }
    setBusy(true);
    try {
      if (kind === "photo") {
        const room = MAX_PORTFOLIO_PHOTOS - photos.length;
        if (room <= 0) {
          toast.error(`Up to ${MAX_PORTFOLIO_PHOTOS} work photos.`);
          return;
        }
        const added: string[] = [];
        for (const file of files.slice(0, room)) {
          if (!file.type.startsWith("image/")) continue;
          if (file.size > 8 * 1024 * 1024) {
            toast.error(`${file.name} is over 8MB.`);
            continue;
          }
          added.push(await uploadPortfolioFile(userId, file, "photo"));
        }
        if (added.length) {
          onPhotosChange([...photos, ...added]);
          toast.success("Photos uploaded — save to apply.");
        }
      } else {
        const file = files[0];
        if (!file) return;
        if (!file.type.startsWith("video/")) {
          toast.error("Pick a video file.");
          return;
        }
        if (file.size > 60 * 1024 * 1024) {
          toast.error("That video is over 60MB.");
          return;
        }
        onVideoChange(await uploadPortfolioFile(userId, file, "video"));
        toast.success("Video uploaded — save to apply.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That upload failed.");
    } finally {
      setBusy(false);
      if (photoInput.current) photoInput.current.value = "";
      if (videoInput.current) videoInput.current.value = "";
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-panel p-3">
      <div className="space-y-2">
        <Label>Work photos ({photos.length}/{MAX_PORTFOLIO_PHOTOS})</Label>
        {photos.length ? (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((path, index) => (
              <div key={path} className="relative overflow-hidden rounded-lg border border-border">
                {urls[path] ? (
                  <img
                    src={urls[path]}
                    alt={`Work photo ${index + 1}`}
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="grid aspect-square w-full place-items-center text-[10px] text-muted-foreground">
                    {mediaQuery.isLoading ? "Loading…" : "Preview unavailable"}
                  </div>
                )}
                <button
                  type="button"
                  aria-label={`Remove work photo ${index + 1}`}
                  onClick={() => onPhotosChange(photos.filter((item) => item !== path))}
                  className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-background/85"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No work photos on this specialist yet.</p>
        )}
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => void upload(Array.from(event.target.files ?? []), "photo")}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => photoInput.current?.click()}
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ImagePlus className="mr-2 h-4 w-4" />
          )}
          Add photos
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Intro video</Label>
        {video ? (
          urls[video] ? (
            <video src={urls[video]} controls className="w-full rounded-lg border border-border" />
          ) : (
            <p className="text-xs text-muted-foreground">
              {mediaQuery.isLoading ? "Loading video…" : "Video preview unavailable."}
            </p>
          )
        ) : (
          <p className="text-xs text-muted-foreground">No intro video uploaded.</p>
        )}
        <input
          ref={videoInput}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(event) => void upload(Array.from(event.target.files ?? []), "video")}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => videoInput.current?.click()}
          >
            <Film className="mr-2 h-4 w-4" />
            {video ? "Replace video" : "Upload video"}
          </Button>
          {video ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onVideoChange(null)}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Remove video
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}


const list = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const num = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface UserEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to create a brand-new account. */
  profile?: ProfileFullRow | null;
  onSaved: () => void | Promise<unknown>;
}

export function UserEditorDialog({
  open,
  onOpenChange,
  profile,
  onSaved,
}: UserEditorDialogProps) {
  const editing = Boolean(profile);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!profile) {
      setForm(EMPTY);
      return;
    }
    setForm(fromProfile(profile));
    setLoading(true);
    getUserAccount({ data: { userId: profile.id } })
      .then((account) =>
        setForm((prev) => ({
          ...prev,
          email: account.email,
          roles: account.roles.length ? (account.roles as AppRole[]) : ["client"],
        })),
      )
      .catch(() => toast.error("Couldn't load this account's sign-in details."))
      .finally(() => setLoading(false));
  }, [open, profile]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function toggleRole(role: AppRole, checked: boolean) {
    setForm((prev) => ({
      ...prev,
      roles: checked ? [...new Set([...prev.roles, role])] : prev.roles.filter((r) => r !== role),
    }));
  }

  function fields() {
    return {
      display_name: form.display_name.trim(),
      username: form.username.trim() || null,
      phone: form.phone.trim() || null,
      city: form.city.trim(),
      address: form.address.trim(),
      locality: form.locality.trim(),
      headline: form.headline.trim(),
      bio: form.bio.trim(),
      avatar_url: form.avatar_url.trim() || null,
      hourly_rate: num(form.hourly_rate),
      years_experience: num(form.years_experience),
      response_minutes: num(form.response_minutes),
      jobs_completed: num(form.jobs_completed),
      languages: list(form.languages),
      likes: list(form.likes),
      dislikes: list(form.dislikes),
      room: form.room === "none" ? null : (form.room as (typeof ROOMS)[number]),
      vetting: form.vetting as (typeof VETTING)[number],
      account_status: form.account_status as (typeof ACCOUNT_STATUSES)[number],
      status_reason: form.status_reason.trim(),
      ghana_card_number: form.ghana_card_number.trim() || null,
      ghana_card_expiry: form.ghana_card_expiry.trim() || null,
      verified: form.verified,
      available: form.available,
      suspended: form.suspended,
    };
  }

  async function save() {
    if (form.display_name.trim().length < 2) {
      toast.error("A display name of at least 2 characters is required.");
      return;
    }
    setBusy(true);
    try {
      if (editing && profile) {
        await updateUserAccount({
          data: {
            userId: profile.id,
            fields: fields(),
            email: form.email.trim(),
            ...(form.password ? { password: form.password } : {}),
            roles: form.roles,
          },
        });
        toast.success(`${form.display_name} updated`);
      } else {
        await createUserAccount({
          data: {
            email: form.email.trim(),
            password: form.password,
            roles: form.roles.length ? form.roles : ["client"],
            fields: fields(),
          },
        });
        toast.success(`${form.display_name} added`, {
          description: "They can sign in right away with the password you set.",
        });
      }
      await onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${profile?.display_name}` : "Add a member"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Every field on this account, including sign-in email, password and roles."
              : "Creates a confirmed account immediately — no email verification needed."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center">
            <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Sign-in</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ue-email">Email</Label>
                  <Input
                    id="ue-email"
                    type="email"
                    value={form.email}
                    onChange={(event) => set("email", event.target.value)}
                    placeholder="member@example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ue-password">
                    {editing ? "New password (optional)" : "Password"}
                  </Label>
                  <Input
                    id="ue-password"
                    type="text"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(event) => set("password", event.target.value)}
                    placeholder="At least 8 characters"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Roles</Label>
                <div className="flex flex-wrap gap-4">
                  {(["client", "specialist", "admin"] as AppRole[]).map((role) => (
                    <label key={role} className="flex items-center gap-2 text-sm capitalize">
                      <Checkbox
                        checked={form.roles.includes(role)}
                        onCheckedChange={(checked) => toggleRole(role, checked === true)}
                      />
                      {role}
                    </label>
                  ))}
                </div>
              </div>
            </section>

            <Separator />

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Identity</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ue-name">Display name</Label>
                  <Input
                    id="ue-name"
                    value={form.display_name}
                    onChange={(event) => set("display_name", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ue-username">Username</Label>
                  <Input
                    id="ue-username"
                    value={form.username}
                    onChange={(event) => set("username", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ue-phone">Phone</Label>
                  <Input
                    id="ue-phone"
                    value={form.phone}
                    onChange={(event) => set("phone", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ue-city">City</Label>
                  <Input
                    id="ue-city"
                    value={form.city}
                    onChange={(event) => set("city", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ue-address">Address</Label>
                  <Input
                    id="ue-address"
                    value={form.address}
                    onChange={(event) => set("address", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ue-locality">Locality</Label>
                  <Input
                    id="ue-locality"
                    value={form.locality}
                    onChange={(event) => set("locality", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ue-card">Ghana Card number</Label>
                  <Input
                    id="ue-card"
                    value={form.ghana_card_number}
                    onChange={(event) => set("ghana_card_number", event.target.value)}
                    placeholder="GHA-123456789-0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ue-card-expiry">Ghana Card expiry</Label>
                  <Input
                    id="ue-card-expiry"
                    type="date"
                    value={form.ghana_card_expiry}
                    onChange={(event) => set("ghana_card_expiry", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ue-avatar">Profile picture</Label>
                  <AvatarField
                    userId={profile?.id}
                    value={form.avatar_url}
                    name={form.display_name}
                    onChange={(next) => set("avatar_url", next)}
                  />
                </div>

              </div>
            </section>

            <Separator />

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Specialist profile</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ue-headline">Headline</Label>
                  <Input
                    id="ue-headline"
                    value={form.headline}
                    onChange={(event) => set("headline", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ue-bio">Bio</Label>
                  <Textarea
                    id="ue-bio"
                    rows={3}
                    value={form.bio}
                    onChange={(event) => set("bio", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ue-rate">Hourly rate (GHS)</Label>
                  <Input
                    id="ue-rate"
                    type="number"
                    min={0}
                    value={form.hourly_rate}
                    onChange={(event) => set("hourly_rate", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ue-years">Years experience</Label>
                  <Input
                    id="ue-years"
                    type="number"
                    min={0}
                    value={form.years_experience}
                    onChange={(event) => set("years_experience", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ue-response">Response time (minutes)</Label>
                  <Input
                    id="ue-response"
                    type="number"
                    min={0}
                    value={form.response_minutes}
                    onChange={(event) => set("response_minutes", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ue-jobs">Jobs completed</Label>
                  <Input
                    id="ue-jobs"
                    type="number"
                    min={0}
                    value={form.jobs_completed}
                    onChange={(event) => set("jobs_completed", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ue-languages">Languages (comma separated)</Label>
                  <Input
                    id="ue-languages"
                    value={form.languages}
                    onChange={(event) => set("languages", event.target.value)}
                    placeholder="English, Twi"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ue-likes">Likes</Label>
                  <Input
                    id="ue-likes"
                    value={form.likes}
                    onChange={(event) => set("likes", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ue-dislikes">Dislikes</Label>
                  <Input
                    id="ue-dislikes"
                    value={form.dislikes}
                    onChange={(event) => set("dislikes", event.target.value)}
                  />
                </div>
              </div>
            </section>

            <Separator />

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Placement &amp; state</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Room</Label>
                  <Select value={form.room} onValueChange={(value) => set("room", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No room</SelectItem>
                      {ROOMS.map((room) => (
                        <SelectItem key={room} value={room} className="capitalize">
                          {room}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Vetting</Label>
                  <Select value={form.vetting} onValueChange={(value) => set("vetting", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VETTING.map((state) => (
                        <SelectItem key={state} value={state}>
                          {state.replace("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Account status</Label>
                  <Select
                    value={form.account_status}
                    onValueChange={(value) => set("account_status", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {ACCOUNT_STATUS_META[status].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ue-reason">Status note</Label>
                <Textarea
                  id="ue-reason"
                  rows={2}
                  value={form.status_reason}
                  onChange={(event) => set("status_reason", event.target.value)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ["verified", "Verified badge"],
                    ["available", "Available for work"],
                    ["suspended", "Suspended"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    {label}
                    <Switch
                      checked={form[key]}
                      onCheckedChange={(checked) => set(key, checked)}
                    />
                  </label>
                ))}
              </div>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy || loading}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : editing ? (
              "Save changes"
            ) : (
              "Create account"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
