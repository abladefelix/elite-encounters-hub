CREATE OR REPLACE FUNCTION public.create_group_booking_snapshot(_group_id uuid, _service_id uuid, _hours numeric, _requesting_user uuid, _scheduled_for timestamp with time zone DEFAULT NULL::timestamp with time zone, _notes text DEFAULT ''::text, _addons text[] DEFAULT '{}'::text[], _paystack_reference text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  caller uuid := _requesting_user;
  grp public.specialist_groups%ROWTYPE;
  svc record;
  member record;
  lead_id uuid;
  booking_id uuid;
  conversation_id uuid;
  booking_member_id uuid;
  settings jsonb;
  fee_pct numeric;
  labour integer;
  extras integer := 0;
  subtotal_value integer;
  fee_value integer;
  total_value integer;
  allocated_subtotal integer := 0;
  allocated_fee integer := 0;
  leg_subtotal integer;
  leg_fee integer;
  member_count integer;
  member_index integer := 0;
  caller_room public.tier;
  caller_rank integer;
  group_rank integer;
  addon_label text;
  addon_item jsonb;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'A verified client identity is required'; END IF;
  IF _hours <= 0 OR _hours > 48 THEN RAISE EXCEPTION 'Hours must be between 0 and 48'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = caller AND role = 'client') THEN RAISE EXCEPTION 'Only clients can request Ash groups'; END IF;
  SELECT m.room INTO caller_room FROM public.memberships m JOIN public.profiles p ON p.id = m.user_id WHERE m.user_id = caller AND m.status = 'active' AND (m.current_period_end IS NULL OR m.current_period_end > now()) AND p.account_status = 'active' AND p.suspended = false AND p.vetting = 'approved' ORDER BY m.created_at DESC LIMIT 1;
  IF caller_room IS NULL THEN RAISE EXCEPTION 'An active, approved client membership is required to request this Ash group'; END IF;
  SELECT * INTO grp FROM public.specialist_groups WHERE id = _group_id AND active AND available FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This Ash group is not accepting requests'; END IF;
  caller_rank := CASE caller_room WHEN 'basic' THEN 1 WHEN 'premium' THEN 2 WHEN 'ultimate' THEN 3 WHEN 'room4' THEN 4 WHEN 'room5' THEN 5 WHEN 'room6' THEN 6 WHEN 'room7' THEN 7 WHEN 'room8' THEN 8 END;
  group_rank := CASE grp.room WHEN 'basic' THEN 1 WHEN 'premium' THEN 2 WHEN 'ultimate' THEN 3 WHEN 'room4' THEN 4 WHEN 'room5' THEN 5 WHEN 'room6' THEN 6 WHEN 'room7' THEN 7 WHEN 'room8' THEN 8 END;
  IF caller_rank < group_rank THEN RAISE EXCEPTION 'Upgrade your room to request this group'; END IF;
  SELECT gs.rate, gs.minimum_hours, s.name INTO svc FROM public.specialist_group_services gs JOIN public.services s ON s.id = gs.service_id WHERE gs.group_id = grp.id AND gs.service_id = _service_id AND gs.active AND s.active;
  IF NOT FOUND THEN RAISE EXCEPTION 'That service is not available from this group'; END IF;
  IF _hours < svc.minimum_hours THEN RAISE EXCEPTION 'This service requires at least % hours', svc.minimum_hours; END IF;
  IF EXISTS (SELECT 1 FROM public.specialist_group_members gm LEFT JOIN public.profiles p ON p.id = gm.specialist_id LEFT JOIN public.user_roles ur ON ur.user_id = gm.specialist_id AND ur.role = 'specialist' WHERE gm.group_id = grp.id AND gm.active AND (p.id IS NULL OR p.vetting <> 'approved' OR p.account_status <> 'active' OR p.suspended OR ur.user_id IS NULL)) THEN RAISE EXCEPTION 'This Ash group roster is not currently available'; END IF;
  SELECT count(*), (array_agg(specialist_id) FILTER (WHERE is_lead))[1] INTO member_count, lead_id FROM public.specialist_group_members WHERE group_id = grp.id AND active;
  IF member_count < 1 OR lead_id IS NULL THEN RAISE EXCEPTION 'This Ash group has no valid lead or roster'; END IF;
  IF abs((SELECT coalesce(sum(share_pct), 0) FROM public.specialist_group_members WHERE group_id = grp.id AND active) - 100) > 0.001 THEN RAISE EXCEPTION 'Group payout shares must total 100%%'; END IF;
  settings := coalesce((SELECT data FROM public.platform_settings WHERE id = true), '{}'::jsonb);
  fee_pct := coalesce((settings->'platform'->>'platformFeePct')::numeric, 12);
  labour := round(_hours * svc.rate);
  IF coalesce((settings->'addons'->>'enabled')::boolean, true) THEN
    FOREACH addon_label IN ARRAY _addons LOOP
      SELECT value INTO addon_item FROM jsonb_array_elements(coalesce(settings->'addons'->'items', '[]'::jsonb)) WHERE lower(trim(value->>'label')) = lower(trim(addon_label)) LIMIT 1;
      IF addon_item IS NULL THEN RAISE EXCEPTION 'The add-on "%" is unavailable', addon_label; END IF;
      extras := extras + greatest(coalesce((addon_item->>'price')::integer, 0), 0);
      addon_item := NULL;
    END LOOP;
  ELSIF cardinality(_addons) > 0 THEN RAISE EXCEPTION 'Add-ons are currently unavailable'; END IF;
  subtotal_value := labour + extras;
  fee_value := round(subtotal_value * fee_pct / 100);
  total_value := subtotal_value + fee_value;
  INSERT INTO public.group_bookings (group_id, client_id, service_id, service_name, scheduled_for, hours, addons, notes, subtotal, platform_fee_pct, platform_fee, total, status, paystack_reference, allocation_locked) VALUES (grp.id, caller, _service_id, svc.name, _scheduled_for, _hours, _addons, left(coalesce(_notes, ''), 1200), subtotal_value, fee_pct, fee_value, total_value, 'requested', NULL, true) RETURNING id INTO booking_id;
  INSERT INTO public.threads (client_id, specialist_id, room, is_group, group_booking_id, last_message) VALUES (caller, lead_id, grp.room, true, booking_id, 'Ash group request sent — checking the crew availability.') RETURNING id INTO conversation_id;
  INSERT INTO public.thread_participants (thread_id, user_id, participant_role) VALUES (conversation_id, caller, 'client');
  FOR member IN SELECT * FROM public.specialist_group_members WHERE group_id = grp.id AND active ORDER BY is_lead DESC, created_at, id LOOP
    member_index := member_index + 1;
    IF member_index = member_count THEN leg_subtotal := subtotal_value - allocated_subtotal; leg_fee := fee_value - allocated_fee;
    ELSE leg_subtotal := round(subtotal_value * member.share_pct / 100); leg_fee := round(fee_value * member.share_pct / 100); allocated_subtotal := allocated_subtotal + leg_subtotal; allocated_fee := allocated_fee + leg_fee; END IF;
    INSERT INTO public.group_booking_members (group_booking_id, specialist_id, role_label, is_lead, share_pct, allocated_amount, platform_fee, payout_amount, status) VALUES (booking_id, member.specialist_id, member.role_label, member.is_lead, member.share_pct, leg_subtotal + leg_fee, leg_fee, leg_subtotal, 'pending') RETURNING id INTO booking_member_id;
    INSERT INTO public.thread_participants (thread_id, user_id, participant_role) VALUES (conversation_id, member.specialist_id, CASE WHEN member.is_lead THEN 'lead' ELSE 'member' END) ON CONFLICT (thread_id, user_id) DO UPDATE SET participant_role = EXCLUDED.participant_role;
    INSERT INTO public.notifications (user_id, title, body, kind, link) VALUES (member.specialist_id, 'Availability requested for an Ash group', grp.name || ' needs your response for ' || svc.name || '. Confirm or decline in the shared conversation before the client can pay.', 'booking', '/messages?thread=' || conversation_id::text);
  END LOOP;
  INSERT INTO public.messages (thread_id, author_id, kind, body) VALUES (conversation_id, NULL, 'system', 'Request sent for ' || svc.name || '. Payment stays locked until every assigned specialist confirms availability.');
  RETURN jsonb_build_object('group_booking_id', booking_id, 'thread_id', conversation_id, 'total', total_value, 'service_name', svc.name, 'lead_id', lead_id, 'status', 'requested');
END;
$function$;

CREATE OR REPLACE FUNCTION public.respond_group_booking_availability(_group_booking_id uuid, _requesting_user uuid, _available boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  member_row public.group_booking_members%ROWTYPE;
  booking_row public.group_bookings%ROWTYPE;
  conversation_id uuid;
  pending_count integer;
  declined_count integer;
BEGIN
  IF _requesting_user IS NULL THEN RAISE EXCEPTION 'A verified specialist identity is required'; END IF;
  SELECT * INTO booking_row FROM public.group_bookings WHERE id = _group_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That Ash group request no longer exists'; END IF;
  IF booking_row.status <> 'requested' THEN RAISE EXCEPTION 'This Ash group request is no longer awaiting availability'; END IF;
  SELECT * INTO member_row FROM public.group_booking_members WHERE group_booking_id = _group_booking_id AND specialist_id = _requesting_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only an assigned specialist can respond to this request'; END IF;
  IF member_row.status <> 'pending' THEN RAISE EXCEPTION 'You have already responded to this request'; END IF;
  SELECT id INTO conversation_id FROM public.threads WHERE group_booking_id = _group_booking_id;
  UPDATE public.group_booking_members SET status = CASE WHEN _available THEN 'confirmed' ELSE 'declined' END, updated_at = now() WHERE id = member_row.id;
  INSERT INTO public.messages (thread_id, author_id, kind, body) VALUES (conversation_id, NULL, 'system', CASE WHEN _available THEN member_row.role_label || ' confirmed availability.' ELSE member_row.role_label || ' is unavailable for this request.' END);
  SELECT count(*) FILTER (WHERE status = 'pending'), count(*) FILTER (WHERE status = 'declined') INTO pending_count, declined_count FROM public.group_booking_members WHERE group_booking_id = _group_booking_id;
  IF declined_count > 0 THEN
    UPDATE public.group_bookings SET status = 'cancelled' WHERE id = _group_booking_id;
    UPDATE public.threads SET last_message = 'Crew unavailable — this request was closed.' WHERE id = conversation_id;
    INSERT INTO public.notifications (user_id, title, body, kind, link) VALUES (booking_row.client_id, 'Ash group unavailable', 'A member of the proposed crew cannot make this request. No payment was taken; choose another group or time.', 'booking', '/messages?thread=' || conversation_id::text);
    RETURN jsonb_build_object('status', 'cancelled', 'thread_id', conversation_id);
  END IF;
  IF pending_count = 0 THEN
    UPDATE public.group_bookings SET status = 'accepted' WHERE id = _group_booking_id;
    UPDATE public.threads SET last_message = 'Crew confirmed — ready for secure payment.' WHERE id = conversation_id;
    INSERT INTO public.messages (thread_id, author_id, kind, body) VALUES (conversation_id, NULL, 'system', 'The full crew is available. The client can now review the locked total and pay securely.');
    INSERT INTO public.notifications (user_id, title, body, kind, link) VALUES (booking_row.client_id, 'Your Ash group is ready', 'Every assigned specialist confirmed. Review the request in chat and pay when ready.', 'booking', '/messages?thread=' || conversation_id::text);
    RETURN jsonb_build_object('status', 'accepted', 'thread_id', conversation_id);
  END IF;
  RETURN jsonb_build_object('status', 'requested', 'pending', pending_count, 'thread_id', conversation_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.respond_group_booking_availability(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_group_booking_availability(uuid, uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_group_booking_payment(_group_booking_id uuid, _requesting_user uuid, _paystack_reference text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  booking_row public.group_bookings%ROWTYPE;
  member_row public.group_booking_members%ROWTYPE;
  conversation_id uuid;
  hold_window integer;
  group_name text;
BEGIN
  IF _requesting_user IS NULL OR nullif(trim(_paystack_reference), '') IS NULL THEN RAISE EXCEPTION 'A verified client and payment reference are required'; END IF;
  SELECT * INTO booking_row FROM public.group_bookings WHERE id = _group_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That Ash group request no longer exists'; END IF;
  IF booking_row.client_id <> _requesting_user THEN RAISE EXCEPTION 'Only the requesting client can pay for this Ash group'; END IF;
  IF booking_row.status <> 'accepted' OR booking_row.paid_at IS NOT NULL THEN RAISE EXCEPTION 'The full crew must confirm availability before payment'; END IF;
  IF EXISTS (SELECT 1 FROM public.group_booking_members gbm LEFT JOIN public.profiles p ON p.id = gbm.specialist_id WHERE gbm.group_booking_id = _group_booking_id AND (gbm.status <> 'confirmed' OR p.id IS NULL OR p.vetting <> 'approved' OR p.account_status <> 'active' OR p.suspended)) THEN RAISE EXCEPTION 'The confirmed crew is no longer fully available'; END IF;
  IF EXISTS (SELECT 1 FROM public.escrow_entries WHERE group_booking_id = _group_booking_id) THEN RAISE EXCEPTION 'Payment has already been prepared for this request'; END IF;
  SELECT id INTO conversation_id FROM public.threads WHERE group_booking_id = _group_booking_id;
  IF conversation_id IS NULL THEN RAISE EXCEPTION 'The shared Ash group conversation is missing'; END IF;
  SELECT name INTO group_name FROM public.specialist_groups WHERE id = booking_row.group_id;
  hold_window := coalesce(((SELECT data FROM public.platform_settings WHERE id = true)->'escrow'->>'holdHours')::integer, 24);
  UPDATE public.group_bookings SET paystack_reference = _paystack_reference WHERE id = _group_booking_id;
  FOR member_row IN SELECT * FROM public.group_booking_members WHERE group_booking_id = _group_booking_id ORDER BY is_lead DESC, created_at, id LOOP
    INSERT INTO public.escrow_entries (kind, thread_id, group_booking_id, group_booking_member_id, client_id, specialist_id, label, amount, platform_fee, payout_amount, hold_hours, state, paystack_reference) VALUES ('booking', conversation_id, booking_row.id, member_row.id, booking_row.client_id, member_row.specialist_id, coalesce(group_name, 'Ash group') || ' · ' || booking_row.service_name || ' · ' || booking_row.hours || 'h', member_row.allocated_amount, member_row.platform_fee, member_row.payout_amount, hold_window, 'pending', _paystack_reference);
  END LOOP;
  RETURN jsonb_build_object('group_booking_id', booking_row.id, 'thread_id', conversation_id, 'total', booking_row.total, 'service_name', booking_row.service_name);
END;
$function$;

REVOKE ALL ON FUNCTION public.prepare_group_booking_payment(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_group_booking_payment(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_unpaid_group_booking(_group_booking_id uuid, _requesting_user uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  conversation_id uuid;
BEGIN
  IF _requesting_user IS NULL THEN RAISE EXCEPTION 'A verified client identity is required'; END IF;
  SELECT t.id INTO conversation_id FROM public.group_bookings gb LEFT JOIN public.threads t ON t.group_booking_id = gb.id WHERE gb.id = _group_booking_id AND gb.client_id = _requesting_user AND gb.paid_at IS NULL AND gb.status IN ('requested', 'accepted') FOR UPDATE OF gb;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the verified client can cancel their unpaid group booking'; END IF;
  DELETE FROM public.escrow_entries WHERE group_booking_id = _group_booking_id AND state = 'pending' AND paid_at IS NULL;
  UPDATE public.group_bookings SET status = 'cancelled', paystack_reference = NULL WHERE id = _group_booking_id;
  IF conversation_id IS NOT NULL THEN
    INSERT INTO public.messages (thread_id, author_id, kind, body) VALUES (conversation_id, NULL, 'system', 'The client cancelled this Ash group request. No payment was taken.');
    UPDATE public.threads SET last_message = 'Ash group request cancelled.' WHERE id = conversation_id;
  END IF;
  RETURN true;
END;
$function$;