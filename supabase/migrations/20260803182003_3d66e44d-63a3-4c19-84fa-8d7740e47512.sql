-- 1) Guard privileged profile columns on INSERT as well as UPDATE
CREATE OR REPLACE FUNCTION public.protect_profile_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF private.is_admin() OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.room := NULL;
  NEW.vetting := 'pending'::public.vetting_status;
  NEW.verified := FALSE;
  NEW.suspended := FALSE;
  NEW.rating := 0;
  NEW.jobs_completed := 0;
  NEW.account_status := 'pending'::public.account_status;
  NEW.status_reason := '';
  NEW.status_changed_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profiles_insert ON public.profiles;
CREATE TRIGGER protect_profiles_insert
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_insert();

-- 2) Strict review eligibility: booking/thread must link rater and rated
CREATE OR REPLACE FUNCTION private.can_review(_rated uuid, _booking uuid, _thread uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL
     AND _rated IS NOT NULL
     AND _rated <> auth.uid()
     AND (_booking IS NOT NULL OR _thread IS NOT NULL)
     AND (
       _booking IS NULL OR EXISTS (
         SELECT 1 FROM public.bookings b
          WHERE b.id = _booking
            AND b.client_id = auth.uid()
            AND b.specialist_id = _rated
            AND b.status IN ('completed','paid')
       )
     )
     AND (
       _thread IS NULL OR EXISTS (
         SELECT 1 FROM public.threads t
          WHERE t.id = _thread
            AND t.client_id = auth.uid()
            AND t.specialist_id = _rated
       )
     )
     AND (
       EXISTS (
         SELECT 1 FROM public.bookings b
          WHERE b.client_id = auth.uid()
            AND b.specialist_id = _rated
            AND b.status IN ('completed','paid')
       )
       OR EXISTS (
         SELECT 1 FROM public.escrow_entries e
          WHERE e.client_id = auth.uid()
            AND e.specialist_id = _rated
            AND e.state IN ('clearing','released')
       )
     )
$$;

REVOKE ALL ON FUNCTION private.can_review(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Clients review after a completed job" ON public.ratings;
CREATE POLICY "Clients review after a completed job"
ON public.ratings FOR INSERT TO authenticated
WITH CHECK (rater_id = auth.uid() AND private.can_review(rated_id, booking_id, thread_id));