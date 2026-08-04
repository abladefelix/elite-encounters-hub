CREATE OR REPLACE FUNCTION private.can_view_specialist_group(_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT
    private.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.specialist_group_members gm
      WHERE gm.group_id = _group_id
        AND gm.specialist_id = auth.uid()
        AND gm.active
    )
    OR EXISTS (
      SELECT 1
      FROM public.specialist_groups g
      JOIN public.profiles viewer ON viewer.id = auth.uid()
      JOIN public.user_roles role ON role.user_id = viewer.id AND role.role = 'client'
      WHERE g.id = _group_id
        AND g.active
        AND g.available
        AND viewer.account_status = 'active'
        AND viewer.room IS NOT NULL
        AND CASE viewer.room
          WHEN 'basic' THEN 1 WHEN 'premium' THEN 2 WHEN 'ultimate' THEN 3
          WHEN 'room4' THEN 4 WHEN 'room5' THEN 5 WHEN 'room6' THEN 6
          WHEN 'room7' THEN 7 WHEN 'room8' THEN 8 ELSE 0 END
          >= CASE g.room
          WHEN 'basic' THEN 1 WHEN 'premium' THEN 2 WHEN 'ultimate' THEN 3
          WHEN 'room4' THEN 4 WHEN 'room5' THEN 5 WHEN 'room6' THEN 6
          WHEN 'room7' THEN 7 WHEN 'room8' THEN 8 ELSE 99 END
    );
$$;

REVOKE ALL ON FUNCTION private.can_view_specialist_group(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_view_specialist_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_view_specialist_group(uuid) TO service_role;

DROP POLICY IF EXISTS "Eligible members read active specialist groups" ON public.specialist_groups;
CREATE POLICY "Eligible members read active specialist groups"
ON public.specialist_groups FOR SELECT TO authenticated
USING (private.can_view_specialist_group(id));

DROP POLICY IF EXISTS "Members read visible group rosters" ON public.specialist_group_members;
CREATE POLICY "Members read visible group rosters"
ON public.specialist_group_members FOR SELECT TO authenticated
USING (
  private.is_admin()
  OR specialist_id = auth.uid()
  OR (active AND private.can_view_specialist_group(group_id))
);

DROP POLICY IF EXISTS "Members read visible group services" ON public.specialist_group_services;
CREATE POLICY "Members read visible group services"
ON public.specialist_group_services FOR SELECT TO authenticated
USING (
  private.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.specialist_group_members gm
    WHERE gm.group_id = specialist_group_services.group_id
      AND gm.specialist_id = auth.uid()
      AND gm.active
  )
  OR (active AND private.can_view_specialist_group(group_id))
);