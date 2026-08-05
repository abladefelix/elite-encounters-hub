DO $migration$
DECLARE
  definition text;
  old_guard text := 'SELECT room INTO caller_room FROM public.profiles WHERE id = caller AND account_status = ''active'' AND suspended = false AND vetting = ''approved'';';
  new_guard text := 'SELECT m.room INTO caller_room FROM public.memberships m JOIN public.profiles p ON p.id = m.user_id WHERE m.user_id = caller AND m.status = ''active'' AND (m.current_period_end IS NULL OR m.current_period_end > now()) AND p.account_status = ''active'' AND p.suspended = false AND p.vetting = ''approved'' ORDER BY m.created_at DESC LIMIT 1;';
  old_error text := 'IF caller_room IS NULL THEN RAISE EXCEPTION ''Your active client room is required to book this group''; END IF;';
  new_error text := 'IF caller_room IS NULL THEN RAISE EXCEPTION ''An active, approved client membership is required to book this Ash group''; END IF;';
BEGIN
  SELECT pg_get_functiondef('public.create_group_booking_snapshot(uuid,uuid,numeric,uuid,timestamp with time zone,text,text[],text)'::regprocedure)
    INTO definition;
  IF position(old_guard in definition) = 0 THEN
    RAISE EXCEPTION 'Expected Ash group membership guard was not found';
  END IF;
  definition := replace(definition, old_guard, new_guard);
  definition := replace(definition, old_error, new_error);
  EXECUTE definition;
END
$migration$;