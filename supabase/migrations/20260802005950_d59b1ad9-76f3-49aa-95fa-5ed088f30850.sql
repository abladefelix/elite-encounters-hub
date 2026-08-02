CREATE TABLE public.admin_permissions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  super_admin boolean NOT NULL DEFAULT false,
  areas text[] NOT NULL DEFAULT '{}'::text[],
  read_only boolean NOT NULL DEFAULT false,
  can_export boolean NOT NULL DEFAULT true,
  note text NOT NULL DEFAULT '',
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_permissions TO authenticated;
GRANT ALL ON public.admin_permissions TO service_role;

ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin') AND (
    EXISTS (SELECT 1 FROM public.admin_permissions WHERE user_id = _user_id AND super_admin)
    OR NOT EXISTS (SELECT 1 FROM public.admin_permissions WHERE super_admin)
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_can_open(_area text, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.admin_permissions
    WHERE user_id = _user_id AND _area = ANY(areas)
  );
$$;

CREATE POLICY "Admins read their own permissions"
ON public.admin_permissions FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_super_admin());

CREATE POLICY "Super admins add permissions"
ON public.admin_permissions FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins change permissions"
ON public.admin_permissions FOR UPDATE TO authenticated
USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins remove permissions"
ON public.admin_permissions FOR DELETE TO authenticated
USING (public.is_super_admin());

CREATE TRIGGER update_admin_permissions_updated_at
BEFORE UPDATE ON public.admin_permissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.admin_permissions (user_id, super_admin, can_export, note)
SELECT ur.user_id, true, true, 'Bootstrapped from existing admin role'
FROM public.user_roles ur
WHERE ur.role = 'admin'
ON CONFLICT (user_id) DO NOTHING;