CREATE OR REPLACE FUNCTION public.create_group_booking_snapshot(
  _group_id uuid,
  _service_id uuid,
  _hours numeric,
  _scheduled_for timestamptz DEFAULT NULL,
  _notes text DEFAULT '',
  _addons text[] DEFAULT '{}'::text[],
  _paystack_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  caller uuid := auth.uid();
  grp public.specialist_groups%ROWTYPE;
  svc record;
  member record;
  lead_id uuid;
  booking_id uuid;
  conversation_id uuid;
  booking_member_id uuid;
  settings jsonb;
  fee_pct numeric;
  hold_window integer;
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
  IF caller IS NULL THEN RAISE EXCEPTION 'Sign in before booking a specialist group'; END IF;
  IF _hours <= 0 OR _hours > 48 THEN RAISE EXCEPTION 'Hours must be between 0 and 48'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = caller AND role = 'client') THEN
    RAISE EXCEPTION 'Only clients can book specialist groups';
  END IF;
  SELECT room INTO caller_room FROM public.profiles
   WHERE id = caller AND account_status = 'active' AND suspended = false AND vetting = 'approved';
  IF caller_room IS NULL THEN RAISE EXCEPTION 'Your active client room is required to book this group'; END IF;
  SELECT * INTO grp FROM public.specialist_groups WHERE id = _group_id AND active AND available FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This specialist group is not available'; END IF;
  caller_rank := CASE caller_room WHEN 'basic' THEN 1 WHEN 'premium' THEN 2 WHEN 'ultimate' THEN 3 WHEN 'room4' THEN 4 WHEN 'room5' THEN 5 WHEN 'room6' THEN 6 WHEN 'room7' THEN 7 WHEN 'room8' THEN 8 END;
  group_rank := CASE grp.room WHEN 'basic' THEN 1 WHEN 'premium' THEN 2 WHEN 'ultimate' THEN 3 WHEN 'room4' THEN 4 WHEN 'room5' THEN 5 WHEN 'room6' THEN 6 WHEN 'room7' THEN 7 WHEN 'room8' THEN 8 END;
  IF caller_rank < group_rank THEN RAISE EXCEPTION 'Upgrade your room to book this group'; END IF;
  SELECT gs.rate, gs.minimum_hours, s.name INTO svc
    FROM public.specialist_group_services gs JOIN public.services s ON s.id = gs.service_id
   WHERE gs.group_id = grp.id AND gs.service_id = _service_id AND gs.active AND s.active;
  IF NOT FOUND THEN RAISE EXCEPTION 'That service is not available from this group'; END IF;
  IF _hours < svc.minimum_hours THEN RAISE EXCEPTION 'This service requires at least % hours', svc.minimum_hours; END IF;
  IF EXISTS (
    SELECT 1 FROM public.specialist_group_members gm
    LEFT JOIN public.profiles p ON p.id = gm.specialist_id
    LEFT JOIN public.user_roles ur ON ur.user_id = gm.specialist_id AND ur.role = 'specialist'
    WHERE gm.group_id = grp.id AND gm.active
      AND (p.id IS NULL OR p.vetting <> 'approved' OR p.account_status <> 'active' OR p.suspended OR ur.user_id IS NULL)
  ) THEN RAISE EXCEPTION 'This group roster contains an unavailable specialist'; END IF;
  SELECT count(*), max(specialist_id) FILTER (WHERE is_lead)
    INTO member_count, lead_id FROM public.specialist_group_members WHERE group_id = grp.id AND active;
  IF member_count < 1 OR lead_id IS NULL THEN RAISE EXCEPTION 'This group has no valid lead or roster'; END IF;
  IF abs((SELECT coalesce(sum(share_pct), 0) FROM public.specialist_group_members WHERE group_id = grp.id AND active) - 100) > 0.001 THEN
    RAISE EXCEPTION 'Group payout shares must total 100%%';
  END IF;
  settings := coalesce((SELECT data FROM public.platform_settings WHERE id = true), '{}'::jsonb);
  fee_pct := coalesce((settings->'platform'->>'platformFeePct')::numeric, 12);
  hold_window := coalesce((settings->'escrow'->>'holdHours')::integer, 24);
  labour := round(_hours * svc.rate);
  IF coalesce((settings->'addons'->>'enabled')::boolean, true) THEN
    FOREACH addon_label IN ARRAY _addons LOOP
      SELECT value INTO addon_item FROM jsonb_array_elements(coalesce(settings->'addons'->'items', '[]'::jsonb))
       WHERE lower(trim(value->>'label')) = lower(trim(addon_label)) LIMIT 1;
      IF addon_item IS NULL THEN RAISE EXCEPTION 'The add-on "%" is unavailable', addon_label; END IF;
      extras := extras + greatest(coalesce((addon_item->>'price')::integer, 0), 0);
      addon_item := NULL;
    END LOOP;
  ELSIF cardinality(_addons) > 0 THEN
    RAISE EXCEPTION 'Add-ons are currently unavailable';
  END IF;
  subtotal_value := labour + extras;
  fee_value := round(subtotal_value * fee_pct / 100);
  total_value := subtotal_value + fee_value;
  INSERT INTO public.group_bookings (group_id, client_id, service_id, service_name, scheduled_for, hours, addons, notes, subtotal, platform_fee_pct, platform_fee, total, status, paystack_reference, allocation_locked)
  VALUES (grp.id, caller, _service_id, svc.name, _scheduled_for, _hours, _addons, left(coalesce(_notes, ''), 1200), subtotal_value, fee_pct, fee_value, total_value, 'requested', _paystack_reference, true)
  RETURNING id INTO booking_id;
  INSERT INTO public.threads (client_id, specialist_id, room, is_group, group_booking_id, last_message)
  VALUES (caller, lead_id, grp.room, true, booking_id, 'Group booking created — payment awaiting confirmation.')
  RETURNING id INTO conversation_id;
  INSERT INTO public.thread_participants (thread_id, user_id, participant_role, can_manage)
  VALUES (conversation_id, caller, 'client', false);
  FOR member IN SELECT * FROM public.specialist_group_members WHERE group_id = grp.id AND active ORDER BY is_lead DESC, created_at, id LOOP
    member_index := member_index + 1;
    IF member_index = member_count THEN
      leg_subtotal := subtotal_value - allocated_subtotal;
      leg_fee := fee_value - allocated_fee;
    ELSE
      leg_subtotal := round(subtotal_value * member.share_pct / 100);
      leg_fee := round(fee_value * member.share_pct / 100);
      allocated_subtotal := allocated_subtotal + leg_subtotal;
      allocated_fee := allocated_fee + leg_fee;
    END IF;
    INSERT INTO public.group_booking_members (group_booking_id, specialist_id, role_label, is_lead, share_pct, allocated_amount, platform_fee, payout_amount, status)
    VALUES (booking_id, member.specialist_id, member.role_label, member.is_lead, member.share_pct, leg_subtotal + leg_fee, leg_fee, leg_subtotal, 'assigned')
    RETURNING id INTO booking_member_id;
    INSERT INTO public.escrow_entries (kind, thread_id, group_booking_id, group_booking_member_id, client_id, specialist_id, label, amount, platform_fee, payout_amount, hold_hours, state, paystack_reference)
    VALUES ('booking', conversation_id, booking_id, booking_member_id, caller, member.specialist_id, grp.name || ' · ' || svc.name || ' · ' || _hours || 'h', leg_subtotal + leg_fee, leg_fee, leg_subtotal, hold_window, 'pending', _paystack_reference);
    INSERT INTO public.thread_participants (thread_id, user_id, participant_role, can_manage)
    VALUES (conversation_id, member.specialist_id, CASE WHEN member.is_lead THEN 'lead' ELSE 'specialist' END, member.is_lead)
    ON CONFLICT (thread_id, user_id) DO UPDATE SET participant_role = EXCLUDED.participant_role, can_manage = EXCLUDED.can_manage;
  END LOOP;
  RETURN jsonb_build_object('group_booking_id', booking_id, 'thread_id', conversation_id, 'total', total_value, 'service_name', svc.name, 'lead_id', lead_id);
END;
$$;
REVOKE ALL ON FUNCTION public.create_group_booking_snapshot(uuid, uuid, numeric, timestamptz, text, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_group_booking_snapshot(uuid, uuid, numeric, timestamptz, text, text[], text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_unpaid_group_booking(_group_booking_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  conversation_id uuid;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT t.id INTO conversation_id
    FROM public.group_bookings gb LEFT JOIN public.threads t ON t.group_booking_id = gb.id
   WHERE gb.id = _group_booking_id AND gb.client_id = caller AND gb.paid_at IS NULL AND gb.status = 'requested'
   FOR UPDATE OF gb;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only your own unpaid group booking can be cancelled'; END IF;
  DELETE FROM public.escrow_entries WHERE group_booking_id = _group_booking_id AND state = 'pending' AND paid_at IS NULL;
  IF conversation_id IS NOT NULL THEN
    DELETE FROM public.messages WHERE thread_id = conversation_id;
    DELETE FROM public.thread_participants WHERE thread_id = conversation_id;
    DELETE FROM public.threads WHERE id = conversation_id;
  END IF;
  DELETE FROM public.group_booking_members WHERE group_booking_id = _group_booking_id;
  DELETE FROM public.group_bookings WHERE id = _group_booking_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_unpaid_group_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_unpaid_group_booking(uuid) TO authenticated;