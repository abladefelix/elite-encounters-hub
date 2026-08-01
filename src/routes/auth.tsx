import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Loader2, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useFeatureFlags } from "@/lib/feature-flags";
import { isEmailShaped, isGhanaCardShaped, GHANA_CARD_HINT } from "@/lib/account-status";
import { checkAvailability, signInWithIdentifier } from "@/lib/identity.functions";
import { Checkbox } from "@/components/ui/checkbox";
import { SignupFieldsForm, type SignupValues } from "@/components/signup-fields-form";
import { PortfolioPicker } from "@/components/portfolio-picker";
import { BrandMark } from "@/components/brand-mark";
import { BUILTIN_FIELDS, appliesTo, useSignupConfig } from "@/lib/signup-fields";

/** Only same-origin relative paths are ever used as a post-login destination. */
function safeNext(value: unknown) {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

/** Turns any thrown value — including an empty object — into something readable. */
function readableError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["message", "error_description", "error", "detail"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return fallback;
}

/** Database constraint names are useless to a member — translate them. */
function signUpErrorMessage(raw: string) {
  const text = (raw || "").toLowerCase();
  if (text.includes("username")) return "That username is already taken. Try another one.";
  if (text.includes("phone")) return "That phone number is already registered.";
  if (text.includes("ghana_card")) return "That Ghana Card number is already registered.";
  if (text.includes("already registered") || text.includes("already exists"))
    return "An account already uses that email address. Try signing in instead.";
  if (text.includes("password")) return "Choose a stronger password (at least 8 characters).";
  return raw || "We couldn't create that account. Try again.";
}

export const Route = createFileRoute("/auth")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { next?: string; role?: "client" | "specialist" } => ({
    next: safeNext(search["next"]),
    role: search["role"] === "specialist" ? "specialist" : "client",
  }),
  head: () => ({
    meta: [
      { title: "Sign in to Ashnight | Members-only ash services" },
      {
        name: "description",
        content:
          "Sign in or create your Ashnight account to reach vetted ash specialists, book securely in chat, and manage your room membership.",
      },
      { property: "og:title", content: "Sign in to Ashnight" },
      {
        property: "og:description",
        content: "Members-only access to vetted ash specialists across Ghana.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthRoutePage,
});

function AuthRoutePage() {
  const { next, role: intendedRole } = useSearch({ from: "/auth" });
  return <AuthPage next={next} intendedRole={intendedRole} />;
}

export function AuthPage({
  next = "/",
  intendedRole = "client",
}: {
  next?: string;
  intendedRole?: "client" | "specialist";
}) {
  const navigate = useNavigate();
  const { session, loading, isAdmin } = useAuth();

  const { flags } = useFeatureFlags();
  const { config } = useSignupConfig();
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"client" | "specialist">(intendedRole ?? "client");
  const [values, setValues] = useState<SignupValues>({});
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [portfolioPhotos, setPortfolioPhotos] = useState<File[]>([]);
  const [portfolioVideo, setPortfolioVideo] = useState<File | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptMarketing, setAcceptMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">(
    intendedRole === "specialist" ? "signup" : "signin",
  );

  useEffect(() => {
    if (intendedRole !== "specialist") return;
    setRole("specialist");
    setAuthMode("signup");
  }, [intendedRole]);

  // "/" is the sign-in surface itself, so a signed-in member must be sent
  // somewhere real: admins into the control room, everyone else to their rooms.
  useEffect(() => {
    if (loading || !session) return;
    const destination = next && next !== "/" ? next : isAdmin ? "/ashnight-control" : "/rooms";
    void navigate({ to: destination, replace: true });
  }, [loading, session, navigate, next, isAdmin]);

  /** Google is opt-in: admins turn it on in Control room → Features. */
  const googleEnabled = flags.googleSignIn;
  const portfolioEnabled = flags.specialistPortfolioUploads && role === "specialist";

  const fieldText = (key: string) =>
    typeof values[key] === "string" ? (values[key] as string).trim() : "";

  function setValue(key: string, value: string | boolean) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function pickAvatar(file: File | null) {
    setAvatarFile(file);
    setAvatarPreview(file ? URL.createObjectURL(file) : null);
  }

  /**
   * Members sign in with their username or their email address. The lookup and
   * the account-status check both happen on the server, so a blocked account
   * never receives a usable session.
   */
  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    const who = identifier.trim();
    if (who.length < 3) {
      toast.error("Enter your username or email address.");
      return;
    }
    setBusy(true);
    try {
      const tokens = await signInWithIdentifier({ data: { identifier: who, password } });
      const { error } = await supabase.auth.setSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });
      if (error) throw new Error(error.message);
      toast.success("Welcome back.");
    } catch (error) {
      toast.error(readableError(error, "We couldn't sign you in."));
    } finally {
      setBusy(false);
    }
  }

  /** Turns the configured answers into auth metadata the profile trigger reads. */
  function buildMetadata() {
    const text = (key: string) =>
      typeof values[key] === "string" ? (values[key] as string).trim() : "";
    const extra: Record<string, string | boolean> = {};
    for (const field of config.custom) {
      if (!field.enabled || !appliesTo(field.audience, role)) continue;
      const answer = values[`custom:${field.id}`];
      if (answer === undefined || answer === "") continue;
      extra[field.label] = answer;
    }
    if (config.legal.marketingOptIn) extra["Marketing opt-in"] = acceptMarketing;

    return {
      role,
      display_name: text("displayName") || text("username") || email.split("@")[0],
      username: text("username"),
      phone: text("phone"),
      address: text("address"),
      locality: text("locality"),
      city: text("city"),
      headline: text("headline"),
      bio: text("bio"),
      years_experience: text("yearsExperience"),
      languages: text("languages"),
      hourly_rate: text("hourlyRate"),
      ghana_card_number: text("ghanaCard").replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
      ghana_card_expiry: text("ghanaCardExpiry"),
      extra,
      accepted_terms: acceptTerms || !config.legal.requireTerms ? "true" : "false",
      accepted_privacy: acceptPrivacy || !config.legal.requirePrivacy ? "true" : "false",
    };
  }

  /** Fields the admin marked required must actually be answered. */
  function missingRequired() {
    for (const meta of BUILTIN_FIELDS) {
      const field = config.fields[meta.key];
      if (!field?.enabled || !field.required || !appliesTo(field.audience, role)) continue;
      if (meta.type === "avatar") {
        if (!avatarFile) return meta.label;
        continue;
      }
      const answer = values[meta.key];
      if (typeof answer !== "string" || !answer.trim()) return field.label?.trim() || meta.label;
    }
    for (const field of config.custom) {
      if (!field.enabled || !field.required || !appliesTo(field.audience, role)) continue;
      const answer = values[`custom:${field.id}`];
      if (answer === undefined || answer === "" || answer === false) return field.label;
    }
    return null;
  }

  async function signUp(event: React.FormEvent) {
    event.preventDefault();
    if (!flags.signupsOpen) {
      toast.error("Ashnight sign-ups are paused right now", {
        description: "New memberships are closed while we work through the vetting queue.",
      });
      return;
    }
    const missing = missingRequired();
    if (missing) {
      toast.error(`${missing} is required.`);
      return;
    }
    if (config.legal.requireTerms && !acceptTerms) {
      toast.error(`Please accept the ${config.legal.termsTitle}.`);
      return;
    }
    if (config.legal.requirePrivacy && !acceptPrivacy) {
      toast.error(`Please confirm you read the ${config.legal.privacyTitle}.`);
      return;
    }
    if (!isEmailShaped(email)) {
      toast.error("That email address doesn't look right.", {
        description: "Use a full address such as name@example.com.",
      });
      return;
    }
    if (password.length < 8) {
      toast.error("Choose a password with at least 8 characters.");
      return;
    }

    const username = fieldText("username");
    const phone = fieldText("phone");
    const ghanaCard = fieldText("ghanaCard");
    if (ghanaCard && !isGhanaCardShaped(ghanaCard)) {
      toast.error("That Ghana Card number doesn't look right.", { description: GHANA_CARD_HINT });
      return;
    }

    setBusy(true);

    // Ask the server first so a clash is reported in plain English instead of a
    // raw database constraint error.
    try {
      const availability = await checkAvailability({
        data: { username, email, phone, ghanaCard },
      });
      const problems: string[] = [];
      if (availability.username === "taken") problems.push("that username is already taken");
      if (availability.username === "invalid")
        problems.push("usernames use 3-32 letters, numbers, dots or underscores");
      if (availability.email === "taken") problems.push("that email already has an account");
      if (availability.phone === "taken") problems.push("that phone number is already registered");
      if (availability.phone === "invalid") problems.push("that phone number is too short");
      if (availability.ghanaCard === "taken")
        problems.push("that Ghana Card number is already registered");
      if (availability.ghanaCard === "invalid") problems.push(GHANA_CARD_HINT.toLowerCase());
      if (problems.length) {
        setBusy(false);
        toast.error("We couldn't create that account", {
          description: `${problems.join(", ")}.`,
        });
        return;
      }
    } catch (error) {
      setBusy(false);
      toast.error(readableError(error, "We couldn't check those details. Try again."));
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
        data: buildMetadata(),
      },
    });

    // The avatar can only be stored once a session exists (storage is private).
    if (!error && data.session && avatarFile) {
      const path = `${data.session.user.id}/avatar-${Date.now()}`;
      const upload = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, { upsert: true });
      if (!upload.error) {
        await supabase.from("profiles").update({ avatar_url: path }).eq("id", data.session.user.id);
      }
    }

    // Specialist portfolio: work photos plus one intro video, stored privately
    // under the new member's own folder and recorded on their profile.
    if (!error && data.session && portfolioEnabled && (portfolioPhotos.length || portfolioVideo)) {
      const uid = data.session.user.id;
      const photoPaths: string[] = [];
      let videoPath: string | null = null;
      for (const [index, file] of portfolioPhotos.entries()) {
        const path = `${uid}/portfolio/photo-${Date.now()}-${index}-${file.name.replace(/[^\w.-]+/g, "_")}`;
        const upload = await supabase.storage
          .from("attachments")
          .upload(path, file, { contentType: file.type });
        if (!upload.error) photoPaths.push(path);
      }
      if (portfolioVideo) {
        const path = `${uid}/portfolio/video-${Date.now()}-${portfolioVideo.name.replace(/[^\w.-]+/g, "_")}`;
        const upload = await supabase.storage
          .from("attachments")
          .upload(path, portfolioVideo, { contentType: portfolioVideo.type });
        if (!upload.error) videoPath = path;
      }
      if (photoPaths.length || videoPath) {
        const { data: current } = await supabase
          .from("profiles")
          .select("extra")
          .eq("id", uid)
          .maybeSingle();
        const extra = (current?.extra ?? {}) as Record<string, unknown>;
        await supabase
          .from("profiles")
          .update({
            extra: {
              ...extra,
              portfolio_photos: photoPaths,
              portfolio_video: videoPath,
            },
          })
          .eq("id", uid);
      }
    }

    setBusy(false);
    if (error) {
      toast.error(signUpErrorMessage(error.message));
      return;
    }
    if (!data.session) {
      setCheckEmail(true);
      return;
    }
    toast.success("Account created.");
  }


  async function signInWithGoogle() {
    setBusy(true);
    try {
      sessionStorage.setItem("ashnight:next", next);
    } catch {
      /* storage may be unavailable; the default destination still works */
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setBusy(false);
      toast.error("Google sign-in failed. Try again or use your email.");
    }
  }

  async function sendReset() {
    // Password resets always go to an email address, never to a username.
    const target = (isEmailShaped(identifier) ? identifier : email).trim();
    if (!isEmailShaped(target)) {
      toast.error("Type the email address on your account first.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(target, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error(readableError(error, "We couldn't send that reset link."));
      return;
    }
    toast.success("Reset link sent. Check your inbox.");
  }

  if (checkEmail) {
    return (
      <main className="mx-auto flex min-h-[80svh] max-w-md flex-col justify-center px-4 py-10">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto icon-box">
              <Mail className="size-5" />
            </div>
            <CardTitle className="mt-3">Confirm your email</CardTitle>
            <CardDescription>
              We sent a confirmation link to {email}. Open it to activate your Ashnight account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => setCheckEmail(false)}>
              Back to sign in
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[80svh] max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <BrandMark className="mx-auto mb-4 size-16" />
        <h1 className="font-display text-3xl font-semibold tracking-tight">Ashnight</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Members-only access to vetted ash specialists.
        </p>
      </div>

      <Tabs value={authMode} onValueChange={(value) => setAuthMode(value as "signin" | "signup")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signin">Sign in</TabsTrigger>
          <TabsTrigger value="signup">Create account</TabsTrigger>
        </TabsList>

        <TabsContent value="signin">
          <Card>
            <CardContent className="space-y-4 pt-6">
              {googleEnabled ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={busy}
                    onClick={signInWithGoogle}
                  >
                    Continue with Google
                  </Button>
                  <div className="relative text-center text-xs text-muted-foreground">
                    <span className="bg-card px-2">or use your email</span>
                    <div className="absolute inset-x-0 top-1/2 -z-10 border-t border-border" />
                  </div>
                </>
              ) : null}
              <form className="space-y-4" onSubmit={signIn}>
                <div className="space-y-2">
                  <Label htmlFor="signin-identifier">Username or email</Label>
                  <Input
                    id="signin-identifier"
                    type="text"
                    required
                    autoComplete="username"
                    placeholder="ashfan_kojo or you@example.com"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Either works — your username is unique across Ashnight.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
                </Button>
                <button
                  type="button"
                  className="w-full text-xs text-muted-foreground underline-offset-4 hover:underline"
                  onClick={sendReset}
                >
                  Forgot your password?
                </button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="signup">
          <Card>
            <CardContent className="space-y-4 pt-6">
              {googleEnabled ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={busy}
                    onClick={signInWithGoogle}
                  >
                    Continue with Google
                  </Button>
                  <div className="relative text-center text-xs text-muted-foreground">
                    <span className="bg-card px-2">or sign up with email</span>
                    <div className="absolute inset-x-0 top-1/2 -z-10 border-t border-border" />
                  </div>
                </>
              ) : null}
              <form className="space-y-4" onSubmit={signUp}>
                {config.roleChoice ? (
                  <div className="space-y-2">
                    <Label>I am joining as</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["client", "specialist"] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setRole(option)}
                          className={
                            "rounded-lg border px-3 py-2 text-sm capitalize transition-colors " +
                            (role === option
                              ? "border-primary bg-secondary font-medium text-foreground"
                              : "border-border text-muted-foreground hover:text-foreground")
                          }
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {role === "client" ? config.clientIntro : config.specialistIntro}
                    </p>
                  </div>
                ) : null}

                <SignupFieldsForm
                  config={config}
                  role={role}
                  values={values}
                  onChange={setValue}
                  avatarPreview={avatarPreview}
                  onAvatarPick={pickAvatar}
                />

                {portfolioEnabled ? (
                  <PortfolioPicker
                    photos={portfolioPhotos}
                    video={portfolioVideo}
                    onPhotosChange={setPortfolioPhotos}
                    onVideoChange={setPortfolioVideo}
                    onReject={(message) => toast.error(message)}
                  />
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="signup-email">
                    Email<span className="text-primary"> *</span>
                  </Label>
                  <Input
                    id="signup-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">
                    Password<span className="text-primary"> *</span>
                  </Label>
                  <Input
                    id="signup-password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>

                <div className="space-y-3 rounded-lg border border-border/70 bg-secondary/40 p-3">
                  {config.legal.requireTerms ? (
                    <label className="flex items-start gap-3 text-xs">
                      <Checkbox
                        checked={acceptTerms}
                        onCheckedChange={(next) => setAcceptTerms(next === true)}
                      />
                      <span>
                        I accept the{" "}
                        <Link to="/legal" className="underline underline-offset-4">
                          {config.legal.termsTitle}
                        </Link>
                        .
                      </span>
                    </label>
                  ) : null}
                  {config.legal.requirePrivacy ? (
                    <label className="flex items-start gap-3 text-xs">
                      <Checkbox
                        checked={acceptPrivacy}
                        onCheckedChange={(next) => setAcceptPrivacy(next === true)}
                      />
                      <span>
                        I have read the{" "}
                        <Link to="/legal" className="underline underline-offset-4">
                          {config.legal.privacyTitle}
                        </Link>
                        .
                      </span>
                    </label>
                  ) : null}
                  {config.legal.marketingOptIn ? (
                    <label className="flex items-start gap-3 text-xs">
                      <Checkbox
                        checked={acceptMarketing}
                        onCheckedChange={(next) => setAcceptMarketing(next === true)}
                      />
                      <span>Send me Ashnight updates and offers.</span>
                    </label>
                  ) : null}
                </div>

                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Create account"}
                </Button>
              </form>

            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <span>
          Every member is vetted by hand before room access is granted.{" "}
          <Link
            to="/auth"
            search={{ next: "/apply", role: "specialist" }}
            className="underline underline-offset-4"
          >
            Apply as a specialist
          </Link>
          .
        </span>
      </p>
    </main>
  );
}
