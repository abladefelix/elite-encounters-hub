DROP POLICY IF EXISTS "Anyone can read active services" ON public.services;

CREATE POLICY "Visitors can read active services"
ON public.services
FOR SELECT
TO anon
USING (active);

CREATE POLICY "Members read active services, admins read all"
ON public.services
FOR SELECT
TO authenticated
USING (active OR public.is_admin());