import { useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { isBlocked, type AccountStatus } from "@/lib/account-status";
import type { Database } from "@/integrations/supabase/types";
import { getMyFullProfile } from "@/lib/profile-reads.functions";
import { registerCurrentSession, validateCurrentSession } from "@/lib/session-management.functions";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type AppRole = Database["public"]["Enums"]["app_role"];

interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: ProfileRow | null;
  roles: AppRole[];
  isAdmin: boolean;
  isSpecialist: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);

  const loadIdentity = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      setRoles([]);
      return;
    }

    // Mobile networks drop the first request often enough that a single failure
    // used to look like "you're signed out". Retry briefly before giving up,
    // and never wipe a profile we already have.
    const fetchProfile = async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          // Contact and ID columns are not readable from the browser at all; the
          // server function returns your own record only.
          const row = await getMyFullProfile();
          if (row) return row as ProfileRow;
        } catch {
          /* retry below */
        }
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
      return null;
    };

    const [profileResult, rolesResult] = await Promise.all([
      fetchProfile(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setProfile((previous) => profileResult ?? previous);
    if (rolesResult.data) setRoles(rolesResult.data.map((row) => row.role));
  }, []);

  useEffect(() => {
    let active = true;

    // Register the listener before the initial read so no event is missed.
    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);

      if (event === "SIGNED_OUT") {
        setProfile(null);
        setRoles([]);
        queryClient.clear();
        return;
      }

      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
        void loadIdentity(nextSession?.user?.id).then(() => {
          if (active) setLoading(false);
        });
      }
    });

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session);
      await loadIdentity(data.session?.user?.id);
      if (active) setLoading(false);
    })();

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadIdentity, queryClient]);

  useEffect(() => {
    if (!session?.user) return;
    let active = true;
    const device = () => {
      let deviceId = localStorage.getItem("ashnight:device-id");
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem("ashnight:device-id", deviceId);
      }
      const deviceName = /android/i.test(navigator.userAgent) ? "Android device" : /iphone|ipad/i.test(navigator.userAgent) ? "Apple mobile device" : `${navigator.platform || "Web"} browser`;
      return { deviceId, deviceName };
    };
    const enforce = async () => {
      try {
        await registerCurrentSession({ data: device() });
        const result = await validateCurrentSession();
        if (!result.valid && active) {
          toast.error(result.reason || "Your session has ended. Please sign in again.");
          await supabase.auth.signOut();
          window.location.assign("/auth");
        }
      } catch (error) {
        if (!active) return;
        toast.error(error instanceof Error ? error.message : "Your session has ended.");
        await supabase.auth.signOut();
        window.location.assign("/auth");
      }
    };
    void enforce();
    const timer = window.setInterval(() => void enforce(), 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") void enforce(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [session?.user?.id]);

  // A member banned, suspended or deactivated mid-session loses access immediately.
  useEffect(() => {
    const status = profile?.account_status as AccountStatus | undefined;
    if (!profile || !isBlocked(status)) return;
    toast.error(`Your Ashnight account is ${status}.`, {
      description: profile.status_reason || "Contact support if you think this is a mistake.",
    });
    void supabase.auth.signOut();
  }, [profile]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    await loadIdentity(data.user?.id);
  }, [loadIdentity]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setRoles([]);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      profile,
      roles,
      isAdmin: roles.includes("admin"),
      isSpecialist: roles.includes("specialist"),
      refresh,
      signOut,
    }),
    [loading, session, profile, roles, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
