CREATE OR REPLACE FUNCTION public.can_review(_rated uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND _rated IS NOT NULL
     AND _rated <> auth.uid()
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

REVOKE ALL ON FUNCTION public.can_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_review(uuid) TO authenticated;

DROP POLICY IF EXISTS "Members rate as themselves" ON public.ratings;

CREATE POLICY "Clients review after a completed job"
  ON public.ratings FOR INSERT TO authenticated
  WITH CHECK (rater_id = auth.uid() AND public.can_review(rated_id));

CREATE UNIQUE INDEX IF NOT EXISTS ratings_one_per_booking
  ON public.ratings (rater_id, booking_id)
  WHERE booking_id IS NOT NULL;