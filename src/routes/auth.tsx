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
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";

/** Only same-origin relative paths are ever used as a post-login destination. */
function safeNext(value: unknown) {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: safeNext(search["next"]),
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
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = useSearch({ from: "/auth" });
  const { session, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  useEffect(() => {
    if (!loading && session) void navigate({ to: next, replace: true });
  }, [loading, session, navigate, next]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome back.");
  }

  async function signUp(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
        data: { display_name: displayName, city },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
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
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      toast.error("Google sign-in failed. Try again or use your email.");
      return;
    }
    if (result.redirected) return;
    setBusy(false);
  }

  async function sendReset() {
    if (!email) {
      toast.error("Enter your email address first.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error(error.message);
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
        <h1 className="font-display text-3xl font-semibold tracking-tight">Ashnight</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Members-only access to vetted ash specialists.
        </p>
      </div>

      <Tabs defaultValue="signin">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signin">Sign in</TabsTrigger>
          <TabsTrigger value="signup">Create account</TabsTrigger>
        </TabsList>

        <TabsContent value="signin">
          <Card>
            <CardContent className="space-y-4 pt-6">
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
              <form className="space-y-4" onSubmit={signIn}>
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
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
              <form className="space-y-4" onSubmit={signUp}>
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Full name</Label>
                  <Input
                    id="signup-name"
                    required
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-city">City</Label>
                  <Input
                    id="signup-city"
                    placeholder="Accra"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
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
                  <Label htmlFor="signup-password">Password</Label>
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
          <Link to="/apply" className="underline underline-offset-4">
            Apply as a specialist
          </Link>
          .
        </span>
      </p>
    </main>
  );
}
