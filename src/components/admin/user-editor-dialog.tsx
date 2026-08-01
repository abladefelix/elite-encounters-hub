/**
 * One dialog for both hand-creating an account and editing every aspect of an
 * existing one: identity, contact, specialist profile, placement, credentials
 * and roles.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import type { ProfileRow } from "@/lib/queries";

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

function fromProfile(profile: ProfileRow): FormState {
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
  profile?: ProfileRow | null;
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
                  <Label htmlFor="ue-avatar">Avatar URL</Label>
                  <Input
                    id="ue-avatar"
                    value={form.avatar_url}
                    onChange={(event) => set("avatar_url", event.target.value)}
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
