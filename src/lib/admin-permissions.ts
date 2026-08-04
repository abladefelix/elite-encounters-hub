/**
 * Admin roles and per-area permissions.
 *
 * The control room has one super admin tier that decides what every other
 * admin may open, whether they can change anything, and whether they may
 * export data. Permissions live in `admin_permissions`; the database enforces
 * the same rules through `is_super_admin()` so the UI can never be the only
 * gate.
 *
 * Safety net: while no super admin row exists at all, every admin is treated
 * as a super admin so the platform can never lock its owners out.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Database } from "@/integrations/supabase/types";

export type AdminPermissionRow = Database["public"]["Tables"]["admin_permissions"]["Row"];

export interface AdminArea {
  key: string;
  label: string;
  group: "Operations" | "Money" | "Trust & safety" | "Platform";
}

/** Every gateable surface in the control room. Keys are stable — never rename. */
export const ADMIN_AREAS: AdminArea[] = [
  { key: "overview", label: "Overview", group: "Operations" },
  { key: "vetting", label: "Vetting queue", group: "Operations" },
  { key: "users", label: "Users", group: "Operations" },
  { key: "sessions", label: "Session management", group: "Trust & safety" },
  { key: "rooms", label: "Rooms", group: "Operations" },
  { key: "services", label: "Services & add-ons", group: "Operations" },
  { key: "groups", label: "Specialist groups", group: "Operations" },
  { key: "bookings", label: "Bookings", group: "Operations" },
  { key: "performance", label: "Specialist performance", group: "Operations" },
  { key: "escrow", label: "Escrow & gifts", group: "Money" },
  { key: "documents", label: "Invoices & receipts", group: "Money" },
  { key: "finance", label: "Finance & accounting", group: "Money" },
  { key: "moderation", label: "Moderation", group: "Trust & safety" },
  { key: "complaints", label: "Complaints", group: "Trust & safety" },
  { key: "logs", label: "Activity log", group: "Trust & safety" },
  { key: "notifications", label: "Notifications", group: "Platform" },
  { key: "signup", label: "Sign-up form", group: "Platform" },
  { key: "features", label: "Features", group: "Platform" },
  { key: "branding", label: "Brand & wording", group: "Platform" },
  { key: "appearance", label: "Appearance & layout", group: "Platform" },
  { key: "settings", label: "Keys & security", group: "Platform" },
  { key: "email", label: "Email & domain", group: "Platform" },
  { key: "backups", label: "Backups", group: "Platform" },
  { key: "server", label: "Server & DNS", group: "Platform" },
  { key: "demo", label: "Demo data", group: "Platform" },
  { key: "deploy", label: "Deploy", group: "Platform" },
];

export const ADMIN_AREA_LABEL = Object.fromEntries(
  ADMIN_AREAS.map((area) => [area.key, area.label]),
) as Record<string, string>;

/** Areas a newly promoted admin gets by default: day-to-day work, no keys. */
export const DEFAULT_ADMIN_AREAS = [
  "overview",
  "vetting",
  "users",
  "groups",
  "bookings",
  "moderation",
  "complaints",
];

/** `/ashnight-control/finance` → `finance`, the bare route → `overview`. */
export function areaFromPath(pathname: string) {
  const rest = pathname.replace(/^\/ashnight-control\/?/, "").split("/")[0];
  return rest ? rest : "overview";
}

const ROSTER_KEY = ["admin-roster"];

/** The signed-in admin's own permissions, used to gate the whole control room. */
export function useAdminAccess() {
  const { user, isAdmin } = useAuth();

  const query = useQuery({
    queryKey: ["admin-access", user?.id ?? "anon"],
    enabled: Boolean(user?.id) && isAdmin,
    staleTime: 30_000,
    queryFn: async () => {
      const [mine, superAdmins] = await Promise.all([
        supabase.from("admin_permissions").select("*").eq("user_id", user!.id).maybeSingle(),
        supabase.from("admin_permissions").select("user_id").eq("super_admin", true).limit(1),
      ]);
      if (mine.error) throw new Error(mine.error.message);
      return {
        row: mine.data ?? null,
        unclaimed: (superAdmins.data ?? []).length === 0,
      };
    },
  });

  return useMemo(() => {
    const row = query.data?.row ?? null;
    const superAdmin = Boolean(row?.super_admin) || Boolean(query.data?.unclaimed);
    const areas = superAdmin ? ADMIN_AREAS.map((area) => area.key) : (row?.areas ?? []);
    return {
      loading: query.isLoading,
      superAdmin,
      areas,
      readOnly: superAdmin ? false : Boolean(row?.read_only),
      canExport: superAdmin ? true : Boolean(row?.can_export),
      row,
      can: (area: string) => superAdmin || areas.includes(area),
    };
  }, [query.data, query.isLoading]);
}

export interface AdminRosterEntry {
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  accountStatus: Database["public"]["Enums"]["account_status"] | null;
  suspended: boolean;
  roles: Database["public"]["Enums"]["app_role"][];
  permissions: AdminPermissionRow | null;
}

/** Everyone holding the admin role, with their permission record. */
export function useAdminRoster() {
  return useQuery({
    queryKey: ROSTER_KEY,
    queryFn: async (): Promise<AdminRosterEntry[]> => {
      const { data: roleRows, error } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (error) throw new Error(error.message);
      const rows = roleRows ?? [];
      const ids = [...new Set(rows.filter((row) => row.role === "admin").map((row) => row.user_id))];
      if (!ids.length) return [];

      const [profiles, permissions] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, display_name, username, avatar_url, account_status, suspended")
          .in("id", ids),
        supabase.from("admin_permissions").select("*").in("user_id", ids),
      ]);

      const byId = new Map((permissions.data ?? []).map((row) => [row.user_id, row]));
      return ids.map((id) => {
        const profile = (profiles.data ?? []).find((row) => row.id === id);
        return {
          userId: id,
          displayName: profile?.display_name || "Unnamed admin",
          username: profile?.username ?? null,
          avatarUrl: profile?.avatar_url ?? null,
          accountStatus: profile?.account_status ?? null,
          suspended: Boolean(profile?.suspended),
          roles: rows.filter((row) => row.user_id === id).map((row) => row.role),
          permissions: byId.get(id) ?? null,
        };
      });
    },
  });
}


export interface SavePermissionsInput {
  userId: string;
  superAdmin: boolean;
  areas: string[];
  readOnly: boolean;
  canExport: boolean;
  note: string;
}

export function useAdminPermissionMutations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const save = useMutation({
    mutationFn: async (input: SavePermissionsInput) => {
      const { error } = await supabase.from("admin_permissions").upsert(
        {
          user_id: input.userId,
          super_admin: input.superAdmin,
          areas: input.superAdmin ? ADMIN_AREAS.map((area) => area.key) : input.areas,
          read_only: input.superAdmin ? false : input.readOnly,
          can_export: input.superAdmin ? true : input.canExport,
          note: input.note,
          updated_by: user?.id ?? null,
        },
        { onConflict: "user_id" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ROSTER_KEY });
      await queryClient.invalidateQueries({ queryKey: ["admin-access"] });
    },
  });

  const revoke = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("admin_permissions").delete().eq("user_id", userId);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ROSTER_KEY });
      await queryClient.invalidateQueries({ queryKey: ["admin-access"] });
    },
  });

  return { save, revoke };
}
