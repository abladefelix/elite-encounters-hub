-- ============================================================
-- 1. profiles: column-level protection for sensitive fields
-- ============================================================
REVOKE SELECT ON public.profiles FROM anon, authenticated;

GRANT SELECT (
  id, display_name, city, headline, bio, avatar_url,
  likes, dislikes, languages, hourly_rate, years_experience, response_minutes,
  room, vetting, rating, jobs_completed, verified, available, suspended,
  last_seen_at, created_at, updated_at, username,
  account_status, status_reason, status_changed_at,
  terms_accepted_at, privacy_accepted_at
) ON public.profiles TO authenticated;

-- Owner / admin access to the complete record, including sensitive columns.
CREATE OR REPLACE VIEW public.profiles_full
WITH (security_invoker = off) AS
  SELECT p.* FROM public.profiles p
  WHERE p.id = auth.uid() OR public.is_admin();

GRANT SELECT ON public.profiles_full TO authenticated;
GRANT ALL ON public.profiles_full TO service_role;

-- ============================================================
-- 2. user_roles: stop broad specialist role enumeration
-- ============================================================
DROP POLICY IF EXISTS "Members can see specialist roles" ON public.user_roles;

CREATE OR REPLACE VIEW public.specialist_directory
WITH (security_invoker = off) AS
  SELECT p.id, p.display_name, p.username, p.avatar_url, p.city, p.headline, p.bio,
         p.likes, p.dislikes, p.languages, p.hourly_rate, p.years_experience,
         p.response_minutes, p.room, p.vetting, p.rating, p.jobs_completed,
         p.verified, p.available, p.suspended, p.last_seen_at, p.created_at, p.updated_at
  FROM public.profiles p
  JOIN public.user_roles r ON r.user_id = p.id AND r.role = 'specialist'
  WHERE p.vetting = 'approved' AND NOT p.suspended AND p.room IS NOT NULL;

GRANT SELECT ON public.specialist_directory TO authenticated;
GRANT ALL ON public.specialist_directory TO service_role;

-- ============================================================
-- 3. platform_settings: no anonymous read of the full blob
-- ============================================================
DROP POLICY IF EXISTS "Anyone can read platform settings" ON public.platform_settings;

CREATE POLICY "Signed-in members can read platform settings"
  ON public.platform_settings FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.platform_settings FROM anon;

CREATE OR REPLACE VIEW public.platform_settings_public
WITH (security_invoker = off) AS
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'branding', s.data -> 'branding',
    'locale',   s.data -> 'locale',
    'signup',   s.data -> 'signup',
    'features', s.data -> 'features',
    'rooms',    s.data -> 'rooms'
  )) AS data
  FROM public.platform_settings s
  WHERE s.id;

GRANT SELECT ON public.platform_settings_public TO anon, authenticated;
GRANT ALL ON public.platform_settings_public TO service_role;

-- ============================================================
-- 4. storage: ownership checks
-- ============================================================
CREATE OR REPLACE FUNCTION public.storage_thread_participant(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE seg text := (storage.foldername(_name))[2];
BEGIN
  IF seg IS NULL OR seg !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN false;
  END IF;
  RETURN public.in_thread(seg::uuid);
END;
$$;

DROP POLICY IF EXISTS "Members view attachments" ON storage.objects;
CREATE POLICY "Members view attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
      OR public.storage_thread_participant(name)
    )
  );

DROP POLICY IF EXISTS "Members view avatars" ON storage.objects;
CREATE POLICY "Members view avatars"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
      OR name LIKE '%/avatar-%'
    )
  );

-- ============================================================
-- 5. SECURITY DEFINER function execute privileges
-- ============================================================
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
  END LOOP;
END $$;

-- Helpers that RLS policies and app code legitimately evaluate as the caller.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.in_thread(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_can_open(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.account_is_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_room() TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_thread_participant(text) TO authenticated;