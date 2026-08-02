-- Members no longer read the raw settings row: it carries integration keys and
-- backup credentials. They receive the public slice through a server function.
DROP POLICY IF EXISTS "Signed-in members can read platform settings" ON public.platform_settings;

-- Table privileges were revoked when the public view was retired, which also
-- locked admins out. Restore them; RLS keeps reads admin-only.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
REVOKE ALL ON public.platform_settings FROM anon;
