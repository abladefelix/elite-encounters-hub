-- 1) Move RLS helper functions out of the API-exposed public schema ------------
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, anon, service_role;

ALTER FUNCTION public.has_role(uuid, public.app_role) SET SCHEMA private;
ALTER FUNCTION public.is_admin() SET SCHEMA private;
ALTER FUNCTION public.is_super_admin(uuid) SET SCHEMA private;
ALTER FUNCTION public.admin_can_open(text, uuid) SET SCHEMA private;
ALTER FUNCTION public.account_is_active(uuid) SET SCHEMA private;
ALTER FUNCTION public.current_room() SET SCHEMA private;
ALTER FUNCTION public.in_thread(uuid) SET SCHEMA private;
ALTER FUNCTION public.storage_thread_participant(text) SET SCHEMA private;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT private.has_role(auth.uid(), 'admin') $$;

CREATE OR REPLACE FUNCTION private.is_super_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT private.has_role(_user_id, 'admin') AND (
    EXISTS (SELECT 1 FROM public.admin_permissions WHERE user_id = _user_id AND super_admin)
    OR NOT EXISTS (SELECT 1 FROM public.admin_permissions WHERE super_admin)
  );
$$;

CREATE OR REPLACE FUNCTION private.admin_can_open(_area text, _user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT private.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.admin_permissions
    WHERE user_id = _user_id AND _area = ANY(areas)
  );
$$;

CREATE OR REPLACE FUNCTION private.storage_thread_participant(_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE seg text := (storage.foldername(_name))[2];
BEGIN
  IF seg IS NULL OR seg !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN false;
  END IF;
  RETURN private.in_thread(seg::uuid);
END;
$$;

-- Admin permission enforcement, in the database rather than the UI only.
CREATE OR REPLACE FUNCTION private.admin_can_write(_area text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT private.has_role(auth.uid(), 'admin') AND (
    -- Super admins (and, while none is configured, every admin) keep full write access.
    private.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.admin_permissions p
      WHERE p.user_id = auth.uid()
        AND NOT p.read_only
        AND (_area IS NULL OR _area = ANY(p.areas))
    )
  );
$$;

CREATE OR REPLACE FUNCTION private.admin_can_export(_area text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT private.has_role(auth.uid(), 'admin') AND (
    private.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.admin_permissions p
      WHERE p.user_id = auth.uid()
        AND p.can_export
        AND (_area IS NULL OR _area = ANY(p.areas))
    )
  );
$$;

-- Is the given member a publicly listed, approved specialist?
CREATE OR REPLACE FUNCTION private.is_public_specialist(_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles r ON r.user_id = p.id AND r.role = 'specialist'
    WHERE p.id = _id AND p.vetting = 'approved' AND NOT p.suspended AND p.room IS NOT NULL
  );
$$;

-- Do the caller and the given member share a thread or a booking?
CREATE OR REPLACE FUNCTION private.shares_engagement(_other uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.threads t
    WHERE (t.client_id = auth.uid() AND t.specialist_id = _other)
       OR (t.specialist_id = auth.uid() AND t.client_id = _other)
  ) OR EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE (b.client_id = auth.uid() AND b.specialist_id = _other)
       OR (b.specialist_id = auth.uid() AND b.client_id = _other)
  );
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO authenticated, service_role;

-- Public triggers that referenced the moved helpers by name.
CREATE OR REPLACE FUNCTION public.protect_booking_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF private.is_admin() THEN RETURN NEW; END IF;
  IF NEW.status = 'paid' AND OLD.status <> 'paid' THEN
    RAISE EXCEPTION 'Only the payment server can mark a booking as paid';
  END IF;
  IF OLD.status IN ('paid','completed') THEN
    NEW.rate := OLD.rate;
    NEW.hours := OLD.hours;
    NEW.platform_fee_pct := OLD.platform_fee_pct;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF private.is_admin() OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.room := OLD.room;
  NEW.vetting := OLD.vetting;
  NEW.verified := OLD.verified;
  NEW.suspended := OLD.suspended;
  NEW.rating := OLD.rating;
  NEW.jobs_completed := OLD.jobs_completed;
  NEW.account_status := OLD.account_status;
  NEW.status_reason := OLD.status_reason;
  NEW.status_changed_at := OLD.status_changed_at;
  RETURN NEW;
END;
$$;

-- 2) Replace the SECURITY DEFINER views ---------------------------------------
DROP VIEW IF EXISTS public.profiles_full;
DROP VIEW IF EXISTS public.platform_settings_public;
DROP VIEW IF EXISTS public.specialist_directory;

CREATE VIEW public.specialist_directory WITH (security_invoker = on) AS
  SELECT p.id, p.display_name, p.username, p.avatar_url, p.city, p.headline, p.bio,
         p.likes, p.dislikes, p.languages, p.hourly_rate, p.years_experience,
         p.response_minutes, p.room, p.vetting, p.rating, p.jobs_completed,
         p.verified, p.available, p.suspended, p.last_seen_at, p.created_at, p.updated_at
    FROM public.profiles p
   WHERE private.is_public_specialist(p.id);

GRANT SELECT ON public.specialist_directory TO authenticated;

-- 3) Profiles: no more blanket read for every signed-in member ----------------
DROP POLICY IF EXISTS "Signed-in members can read profiles" ON public.profiles;
CREATE POLICY "Members read own, engaged and listed profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR private.is_admin()
  OR private.shares_engagement(id)
  OR private.is_public_specialist(id)
);

-- 4) Ratings: parties, admins, and public specialist reviews only -------------
DROP POLICY IF EXISTS "Signed-in members read ratings" ON public.ratings;
CREATE POLICY "Parties and specialist reviews are readable"
ON public.ratings FOR SELECT TO authenticated
USING (
  rater_id = auth.uid()
  OR rated_id = auth.uid()
  OR private.is_admin()
  OR private.is_public_specialist(rated_id)
);

-- Directory needs to know who is a specialist, without exposing other roles.
DROP POLICY IF EXISTS "Members can see listed specialist roles" ON public.user_roles;
CREATE POLICY "Members can see listed specialist roles"
ON public.user_roles FOR SELECT TO authenticated
USING (role = 'specialist' AND private.is_public_specialist(user_id));

-- 5) Escrow: members can no longer write financial rows themselves ------------
DROP POLICY IF EXISTS "Clients create escrow entries" ON public.escrow_entries;
REVOKE ALL ON public.escrow_entries FROM anon;

-- 6) Enforce read-only / area-scoped admin permissions in RLS -----------------
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('accounting_periods', 'Admins manage accounting periods', 'finance'),
      ('applications',       'Admins manage applications',       'vetting'),
      ('expenses',           'Admins manage expenses',           'finance'),
      ('integration_keys',   'Admins manage integration keys',   'settings'),
      ('journal_entries',    'Admins manage journal entries',    'finance'),
      ('journal_lines',      'Admins manage journal lines',      'finance'),
      ('ledger_accounts',    'Admins manage ledger accounts',    'finance'),
      ('memberships',        'Admins manage memberships',        'users'),
      ('messages',           'Admins manage messages',           'moderation'),
      ('moderation_hits',    'Admins manage moderation hits',    'moderation'),
      ('platform_settings',  'Admins manage platform settings',  NULL),
      ('profiles',           'Admins manage all profiles',       'users'),
      ('ratings',            'Admins manage ratings',            NULL),
      ('reports',            'Admins manage reports',            'moderation'),
      ('services',           'Admins manage services',           'services'),
      ('user_roles',         'Admins manage roles',              'users')
    ) AS t(tbl, policy_name, area)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rec.policy_name, rec.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.is_admin())',
      'Admins read ' || rec.tbl, rec.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (private.admin_can_write(%L))',
      'Admins insert ' || rec.tbl, rec.tbl, rec.area);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (private.admin_can_write(%L)) WITH CHECK (private.admin_can_write(%L))',
      'Admins update ' || rec.tbl, rec.tbl, rec.area, rec.area);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (private.admin_can_write(%L))',
      'Admins delete ' || rec.tbl, rec.tbl, rec.area);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Admins handle complaints" ON public.complaints;
CREATE POLICY "Admins handle complaints"
ON public.complaints FOR UPDATE TO authenticated
USING (private.admin_can_write('complaints')) WITH CHECK (private.admin_can_write('complaints'));

DROP POLICY IF EXISTS "Admins create escrow entries" ON public.escrow_entries;
CREATE POLICY "Admins create escrow entries"
ON public.escrow_entries FOR INSERT TO authenticated
WITH CHECK (private.admin_can_write('escrow'));

DROP POLICY IF EXISTS "Admins update escrow" ON public.escrow_entries;
CREATE POLICY "Admins update escrow"
ON public.escrow_entries FOR UPDATE TO authenticated
USING (private.admin_can_write('escrow')) WITH CHECK (private.admin_can_write('escrow'));

DROP POLICY IF EXISTS "Admins send notifications" ON public.notifications;
CREATE POLICY "Admins send notifications"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (private.admin_can_write('notifications'));

DROP POLICY IF EXISTS "Admins delete notifications" ON public.notifications;
CREATE POLICY "Admins delete notifications"
ON public.notifications FOR DELETE TO authenticated
USING (private.admin_can_write('notifications'));

-- 7) Scheduler secret for the nightly jobs (never shipped to the browser) -----
INSERT INTO public.integration_keys (key, label, description, value, is_secret)
VALUES (
  'job_trigger_secret',
  'Scheduler secret',
  'Sent as the x-ashnight-job-secret header by the backup and escrow release schedulers.',
  encode(gen_random_bytes(32), 'hex'),
  true
)
ON CONFLICT (key) DO NOTHING;