CREATE POLICY "Members can see specialist roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (role = 'specialist'::public.app_role);