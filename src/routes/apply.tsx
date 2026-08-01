import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, LogIn, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { useAuth } from "@/hooks/use-auth";
import { useApplications, useSubmitApplication } from "@/lib/queries";
import { useFeatureFlags } from "@/lib/feature-flags";
import { useServiceCatalog } from "@/lib/service-catalog";
import { cn } from "@/lib/utils";

const ROOM_TIERS: { id: "basic" | "premium" | "ultimate"; name: string }[] = [
  { id: "basic", name: "Basic Room" },
  { id: "premium", name: "Premium Room" },
  { id: "ultimate", name: "Ultimate Room" },
];

const applicationSchema = z.object({
  role: z.enum(["client", "specialist"]),
  fullName: z.string().trim().min(2, "Enter your full name").max(80),
  phone: z.string().trim().min(7, "Enter a contact number").max(32),
  city: z.string().trim().min(2, "Enter your city").max(80),
  room: z.enum(["basic", "premium", "ultimate"]),
  about: z.string().trim().min(20, "Tell us at least a sentence or two").max(1000),
});

type FieldErrors = Partial<Record<keyof z.infer<typeof applicationSchema>, string>>;

export const Route = createFileRoute("/apply")({
  validateSearch: (search: Record<string, unknown>): { role?: "client" | "specialist" } => ({
    role: search["role"] === "specialist" ? "specialist" : "client",
  }),
  head: () => ({
    meta: [
      { title: "Apply to Join Ashnight — Manual Vetting for Every Member" },
      {
        name: "description",
        content:
          "Apply to Ashnight as a ash client or a ash specialist. Every application is reviewed by a person, with ID and reference checks before onboarding.",
      },
      { property: "og:title", content: "Apply to Join Ashnight" },
      {
        property: "og:description",
        content:
          "Applications are reviewed by hand within two business days. ID verification, background and reference checks included.",
      },
    ],
  }),
  component: ApplyPage,
});

function ApplyPage() {
  const { role: intendedRole } = useSearch({ from: "/apply" });
  const { user, loading: authLoading } = useAuth();
  const { data: applications, isLoading: applicationsLoading } = useApplications();
  const submitApplication = useSubmitApplication();
  const { flags } = useFeatureFlags();
  const { selectableServices } = useServiceCatalog();

  const [role, setRole] = useState<"client" | "specialist">(intendedRole ?? "client");
  const [room, setRoom] = useState<"basic" | "premium" | "ultimate">("premium");
  const [services, setServices] = useState<string[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});

  const existingApplication = applications?.find((app) => app.user_id === user?.id);

  if (authLoading || (user && applicationsLoading)) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-xl px-5 py-24 text-center text-sm text-muted-foreground">
          Loading…
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-xl px-5 py-24 text-center">
          <ShieldCheck className="mx-auto size-10 text-accent" />
          <h1 className="mt-6 font-display text-2xl font-semibold">Create an account first</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Applications are tied to your Ashnight account so we can track your vetting status.
            Sign up, then come back here to apply.
          </p>
          <Button asChild variant="brass" className="mt-7">
            <Link to="/auth" search={{ next: "/apply", role: intendedRole ?? "client" }}>
              <LogIn className="size-4" />{" "}
              {intendedRole === "specialist"
                ? "Create your specialist account"
                : "Sign in or create an account"}
            </Link>
          </Button>
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (existingApplication) {
    const statusCopy: Record<string, string> = {
      pending: "Your application is in the queue — we review every one by hand.",
      in_review: "We're actively reviewing your application right now.",
      approved: "You're approved! Head to your profile to finish setting up.",
      rejected: "Your application wasn't approved this time.",
    };
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-xl px-5 py-24 text-center">
          <CheckCircle2 className="mx-auto size-10 text-success" />
          <h1 className="mt-6 font-display text-2xl font-semibold">
            Application {existingApplication.status.replace("_", " ")}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {statusCopy[existingApplication.status] ?? "Thanks for applying."}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Submitted {new Date(existingApplication.created_at).toLocaleDateString()} as a{" "}
            {existingApplication.applied_role}.
          </p>
        </div>
        <SiteFooter />
      </div>
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = applicationSchema.safeParse({
      role,
      room,
      fullName: form.get("fullName"),
      phone: form.get("phone"),
      city: form.get("city"),
      about: form.get("about"),
    });

    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      toast.error("Please fix the highlighted fields");
      return;
    }

    if (role === "specialist" && services.length === 0) {
      toast.error("Pick at least one service you render");
      return;
    }

    if (!flags.specialistApplications && role === "specialist") {
      toast.error("Specialist applications are closed right now");
      return;
    }

    setErrors({});
    const { fullName, phone, city, about } = parsed.data;
    submitApplication.mutate(
      {
        user_id: user!.id,
        applied_role: role,
        full_name: fullName,
        email: user!.email ?? "",
        phone,
        city,
        suggested_room: room,
        pitch: about,
      },
      {
        onSuccess: () => {
          toast.success("Application received — we'll be in touch within two business days");
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Couldn't submit your application");
        },
      },
    );
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <div className="mx-auto grid w-full max-w-5xl gap-8 px-5 py-12 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">Apply to join</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Ashnight is invite-and-vetting only. Tell us who you are and what you need — a human
            reviews every application before you're placed in a room.
          </p>

          <Card className="mt-8 border-border/70 bg-surface p-6">
            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              <div>
                <Label className="text-sm">I'm applying as</Label>
                <RadioGroup
                  value={role}
                  onValueChange={(value) => setRole(value as "client" | "specialist")}
                  className="mt-3 grid gap-3 sm:grid-cols-2"
                >
                  {[
                    {
                      value: "client",
                      title: "A client",
                      body: "I need an ash for my home or business. Paid membership.",
                    },
                    {
                      value: "specialist",
                      title: "A specialist",
                      body: "I provide ash services and want work. Free to join.",
                    },
                  ].map((option) => (
                    <Label
                      key={option.value}
                      htmlFor={`role-${option.value}`}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-4 transition-colors has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5"
                    >
                      <RadioGroupItem
                        id={`role-${option.value}`}
                        value={option.value}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block font-display text-sm font-semibold">
                          {option.title}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {option.body}
                        </span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" name="fullName" error={errors.fullName} />
                <Field label="Phone" name="phone" error={errors.phone} />
                <Field label="City" name="city" error={errors.city} />
              </div>

              <div>
                <Label htmlFor="room" className="text-sm">
                  {role === "client" ? "Room you'd like to join" : "Room you're aiming for"}
                </Label>
                <Select value={room} onValueChange={(value) => setRoom(value as typeof room)}>
                  <SelectTrigger id="room" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROOM_TIERS.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-2 text-xs text-muted-foreground">
                  Final placement is decided manually after vetting.
                  {role === "client"
                    ? " Membership is billed monthly once you're placed."
                    : " Specialists never pay to join — you're paid per booking, minus the platform fee."}
                </p>
              </div>

              {role === "specialist" ? (
                <div>
                  <Label className="text-sm">Services you render</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ashnight operations publishes this catalogue — pick everything you cover.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectableServices.map((service) => {
                      const selected = services.includes(service.id);
                      return (
                        <button
                          key={service.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() =>
                            setServices((prev) =>
                              prev.includes(service.id)
                                ? prev.filter((id) => id !== service.id)
                                : [...prev, service.id],
                            )
                          }
                          className={cn(
                            "rounded-full border px-3.5 py-1.5 text-xs transition-colors",
                            selected
                              ? "border-primary/50 bg-primary/10 text-foreground"
                              : "border-border bg-background text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {service.label}
                        </button>
                      );
                    })}
                    {selectableServices.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No services published yet — we'll follow up after review.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div>
                <Label htmlFor="about" className="text-sm">
                  {role === "client"
                    ? "What do you need cleaned, and how often?"
                    : "Your experience, specialisms and availability"}
                </Label>
                <Textarea
                  id="about"
                  name="about"
                  rows={5}
                  maxLength={1000}
                  className="mt-2"
                  placeholder={
                    role === "client"
                      ? "e.g. 2 bed / 2 bath apartment in Fort Greene, deep clean first then fortnightly upkeep."
                      : "e.g. 6 years hotel housekeeping, deep cleans and move-outs, weekdays 8am–4pm, insured."
                  }
                />
                {errors.about ? (
                  <p className="mt-1.5 text-xs text-destructive">{errors.about}</p>
                ) : null}
              </div>

              <Button
                type="submit"
                variant="brass"
                size="lg"
                className="w-full"
                disabled={submitApplication.isPending}
              >
                Submit application
              </Button>
            </form>
          </Card>
        </div>

        <Card className="h-fit border-border/70 bg-panel p-6">
          <ShieldCheck className="size-5 text-accent" />
          <h2 className="mt-4 font-display text-lg font-semibold">What happens next</h2>
          <ol className="mt-4 space-y-4 text-sm text-muted-foreground">
            {[
              "We review your application by hand — usually within two business days.",
              "You'll get a link to verify a government ID.",
              "Specialists complete a background check, reference calls and a short video interview.",
              "Clients confirm a paid subscription, then we place the account in a room.",
              "Specialists pay nothing to join — you earn per booking, minus the platform fee.",
              "Once you're in, chat, calls, bookings and payments all open up.",
            ].map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full border border-border font-display text-xs">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <SiteFooter />
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  error,
}: {
  label: string;
  name: string;
  type?: string;
  error?: string | undefined;
}) {
  return (
    <div>
      <Label htmlFor={name} className="text-sm">
        {label}
      </Label>
      <Input id={name} name={name} type={type} className="mt-2" maxLength={255} />
      {error ? <p className="mt-1.5 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
