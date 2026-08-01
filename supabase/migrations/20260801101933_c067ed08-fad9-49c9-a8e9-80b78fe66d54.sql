-- Internal helpers must not be callable by anonymous visitors.
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_room() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.in_thread(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.protect_profile_columns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_thread() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_profile_rating() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_rating() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_room() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.in_thread(UUID) TO authenticated, service_role;

-- Public application form: creation only, scoped to the two API roles, and
-- an anonymous submission may never claim to belong to an existing account.
DROP POLICY "Anyone can apply" ON public.applications;
CREATE POLICY "Visitors can submit an application"
  ON public.applications FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);
CREATE POLICY "Members can submit their own application"
  ON public.applications FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());