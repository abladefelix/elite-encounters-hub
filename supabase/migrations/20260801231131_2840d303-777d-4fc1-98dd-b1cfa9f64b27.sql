ALTER TYPE public.tier ADD VALUE IF NOT EXISTS 'room4';
ALTER TYPE public.tier ADD VALUE IF NOT EXISTS 'room5';
ALTER TYPE public.tier ADD VALUE IF NOT EXISTS 'room6';
ALTER TYPE public.tier ADD VALUE IF NOT EXISTS 'room7';
ALTER TYPE public.tier ADD VALUE IF NOT EXISTS 'room8';

GRANT DELETE ON public.notifications TO authenticated;

CREATE POLICY "Admins delete notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE POLICY "Members delete their notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins create escrow entries"
  ON public.escrow_entries FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());