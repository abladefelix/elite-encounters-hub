ALTER TABLE public.threads DROP CONSTRAINT IF EXISTS threads_client_id_specialist_id_key;
CREATE UNIQUE INDEX threads_direct_pair_key
ON public.threads(client_id, specialist_id) WHERE NOT is_group;
CREATE UNIQUE INDEX threads_group_booking_key
ON public.threads(group_booking_id) WHERE is_group AND group_booking_id IS NOT NULL;

DROP POLICY IF EXISTS "Participants update their group bookings" ON public.group_bookings;
CREATE POLICY "Groups admins update group bookings"
ON public.group_bookings FOR UPDATE TO authenticated
USING (private.admin_can_write('groups'))
WITH CHECK (private.admin_can_write('groups'));

DROP POLICY IF EXISTS "Clients create their group bookings" ON public.group_bookings;
CREATE POLICY "Groups admins create group bookings"
ON public.group_bookings FOR INSERT TO authenticated
WITH CHECK (private.admin_can_write('groups'));

CREATE OR REPLACE FUNCTION private.prevent_paid_group_booking_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.allocation_locked OR OLD.paid_at IS NOT NULL THEN
    NEW.group_id := OLD.group_id;
    NEW.client_id := OLD.client_id;
    NEW.service_id := OLD.service_id;
    NEW.service_name := OLD.service_name;
    NEW.hours := OLD.hours;
    NEW.addons := OLD.addons;
    NEW.subtotal := OLD.subtotal;
    NEW.platform_fee_pct := OLD.platform_fee_pct;
    NEW.platform_fee := OLD.platform_fee;
    NEW.total := OLD.total;
    NEW.paystack_reference := OLD.paystack_reference;
    NEW.allocation_locked := OLD.allocation_locked;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_paid_group_booking_trg
BEFORE UPDATE ON public.group_bookings
FOR EACH ROW EXECUTE FUNCTION private.prevent_paid_group_booking_changes();