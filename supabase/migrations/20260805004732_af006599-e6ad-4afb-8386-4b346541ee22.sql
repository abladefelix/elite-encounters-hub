DO $migration$
DECLARE
  definition text;
  old_lead_query text := 'SELECT count(*), max(specialist_id) FILTER (WHERE is_lead) INTO member_count, lead_id FROM public.specialist_group_members WHERE group_id = grp.id AND active;';
  new_lead_query text := 'SELECT count(*), (array_agg(specialist_id) FILTER (WHERE is_lead))[1] INTO member_count, lead_id FROM public.specialist_group_members WHERE group_id = grp.id AND active;';
BEGIN
  SELECT pg_get_functiondef('public.create_group_booking_snapshot(uuid,uuid,numeric,uuid,timestamp with time zone,text,text[],text)'::regprocedure)
    INTO definition;
  IF position(old_lead_query in definition) = 0 THEN
    RAISE EXCEPTION 'Expected Ash group lead lookup was not found';
  END IF;
  definition := replace(definition, old_lead_query, new_lead_query);
  EXECUTE definition;
END
$migration$;