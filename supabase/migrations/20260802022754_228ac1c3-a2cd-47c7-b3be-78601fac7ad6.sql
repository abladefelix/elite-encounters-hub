DROP POLICY IF EXISTS "Signed-in members can read specialist services" ON public.specialist_services;

CREATE POLICY "Members read listed specialist services"
ON public.specialist_services
FOR SELECT
TO authenticated
USING (
  specialist_id = auth.uid()
  OR private.is_admin()
  OR private.is_public_specialist(specialist_id)
);