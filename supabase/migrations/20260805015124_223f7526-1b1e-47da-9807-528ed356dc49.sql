ALTER TABLE public.specialist_group_members
  DROP CONSTRAINT IF EXISTS specialist_group_members_current_roster_check;

ALTER TABLE public.specialist_group_members
  ADD CONSTRAINT specialist_group_members_current_roster_check CHECK (active = true);

CREATE OR REPLACE FUNCTION private.is_thread_participant(_thread_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.thread_participants tp
    WHERE tp.thread_id = _thread_id
      AND tp.user_id = _user_id
      AND tp.hidden_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION private.is_thread_participant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_thread_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_thread_participant(uuid, uuid) TO service_role;

DROP POLICY IF EXISTS "Members read visible group rosters" ON public.specialist_group_members;
CREATE POLICY "Members read visible group rosters"
ON public.specialist_group_members
FOR SELECT
TO authenticated
USING (
  private.is_admin()
  OR specialist_id = auth.uid()
  OR private.can_view_specialist_group(group_id)
);

DROP POLICY IF EXISTS "Participants read shared thread roster" ON public.thread_participants;
CREATE POLICY "Participants read shared thread roster"
ON public.thread_participants
FOR SELECT
TO authenticated
USING (
  private.is_admin()
  OR private.is_thread_participant(thread_id, auth.uid())
);