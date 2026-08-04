CREATE TABLE public.specialist_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 120),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text NOT NULL DEFAULT '',
  cover_url text,
  room public.tier NOT NULL,
  pricing_model text NOT NULL DEFAULT 'flat' CHECK (pricing_model IN ('flat', 'hourly')),
  base_rate integer NOT NULL DEFAULT 0 CHECK (base_rate >= 0),
  capacity integer NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 50),
  available boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.specialist_groups TO authenticated;
GRANT ALL ON public.specialist_groups TO service_role;
ALTER TABLE public.specialist_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Groups admins create specialist groups"
ON public.specialist_groups FOR INSERT TO authenticated
WITH CHECK (private.admin_can_write('groups'));
CREATE POLICY "Groups admins update specialist groups"
ON public.specialist_groups FOR UPDATE TO authenticated
USING (private.admin_can_write('groups'))
WITH CHECK (private.admin_can_write('groups'));
CREATE POLICY "Groups admins delete specialist groups"
ON public.specialist_groups FOR DELETE TO authenticated
USING (private.admin_can_write('groups'));

CREATE TABLE public.specialist_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.specialist_groups(id) ON DELETE CASCADE,
  specialist_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  role_label text NOT NULL DEFAULT 'Member' CHECK (char_length(trim(role_label)) BETWEEN 2 AND 80),
  is_lead boolean NOT NULL DEFAULT false,
  share_pct numeric(5,2) NOT NULL CHECK (share_pct > 0 AND share_pct <= 100),
  active boolean NOT NULL DEFAULT true,
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, specialist_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.specialist_group_members TO authenticated;
GRANT ALL ON public.specialist_group_members TO service_role;
ALTER TABLE public.specialist_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read visible group rosters"
ON public.specialist_group_members FOR SELECT TO authenticated
USING (
  private.is_admin()
  OR specialist_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.specialist_groups g
    WHERE g.id = specialist_group_members.group_id
      AND g.active AND g.available
      AND EXISTS (
        SELECT 1 FROM public.profiles viewer
        JOIN public.user_roles role ON role.user_id = viewer.id AND role.role = 'client'
        WHERE viewer.id = auth.uid()
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
      )
  )
);
CREATE POLICY "Groups admins create group members"
ON public.specialist_group_members FOR INSERT TO authenticated
WITH CHECK (private.admin_can_write('groups'));
CREATE POLICY "Groups admins update group members"
ON public.specialist_group_members FOR UPDATE TO authenticated
USING (private.admin_can_write('groups'))
WITH CHECK (private.admin_can_write('groups'));
CREATE POLICY "Groups admins delete group members"
ON public.specialist_group_members FOR DELETE TO authenticated
USING (private.admin_can_write('groups'));
CREATE UNIQUE INDEX specialist_group_one_lead_idx
ON public.specialist_group_members(group_id) WHERE is_lead AND active;
CREATE INDEX specialist_group_members_specialist_idx
ON public.specialist_group_members(specialist_id) WHERE active;

CREATE POLICY "Eligible members read active specialist groups"
ON public.specialist_groups FOR SELECT TO authenticated
USING (
  private.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.specialist_group_members gm
    WHERE gm.group_id = specialist_groups.id
      AND gm.specialist_id = auth.uid()
      AND gm.active
  )
  OR (
    active AND available
    AND EXISTS (
      SELECT 1 FROM public.profiles viewer
      JOIN public.user_roles role ON role.user_id = viewer.id AND role.role = 'client'
      WHERE viewer.id = auth.uid()
        AND viewer.account_status = 'active'
        AND viewer.room IS NOT NULL
        AND CASE viewer.room
          WHEN 'basic' THEN 1 WHEN 'premium' THEN 2 WHEN 'ultimate' THEN 3
          WHEN 'room4' THEN 4 WHEN 'room5' THEN 5 WHEN 'room6' THEN 6
          WHEN 'room7' THEN 7 WHEN 'room8' THEN 8 ELSE 0 END
          >= CASE specialist_groups.room
          WHEN 'basic' THEN 1 WHEN 'premium' THEN 2 WHEN 'ultimate' THEN 3
          WHEN 'room4' THEN 4 WHEN 'room5' THEN 5 WHEN 'room6' THEN 6
          WHEN 'room7' THEN 7 WHEN 'room8' THEN 8 ELSE 99 END
    )
  )
);

CREATE TABLE public.specialist_group_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.specialist_groups(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  rate integer NOT NULL CHECK (rate > 0),
  minimum_hours numeric(5,2) NOT NULL DEFAULT 1 CHECK (minimum_hours > 0 AND minimum_hours <= 48),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, service_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.specialist_group_services TO authenticated;
GRANT ALL ON public.specialist_group_services TO service_role;
ALTER TABLE public.specialist_group_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read visible group services"
ON public.specialist_group_services FOR SELECT TO authenticated
USING (
  private.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.specialist_group_members gm
    WHERE gm.group_id = specialist_group_services.group_id
      AND gm.specialist_id = auth.uid() AND gm.active
  )
  OR EXISTS (
    SELECT 1 FROM public.specialist_groups g
    WHERE g.id = specialist_group_services.group_id AND g.active AND g.available
      AND EXISTS (
        SELECT 1 FROM public.profiles viewer
        JOIN public.user_roles role ON role.user_id = viewer.id AND role.role = 'client'
        WHERE viewer.id = auth.uid() AND viewer.account_status = 'active' AND viewer.room IS NOT NULL
          AND CASE viewer.room
            WHEN 'basic' THEN 1 WHEN 'premium' THEN 2 WHEN 'ultimate' THEN 3
            WHEN 'room4' THEN 4 WHEN 'room5' THEN 5 WHEN 'room6' THEN 6
            WHEN 'room7' THEN 7 WHEN 'room8' THEN 8 ELSE 0 END
            >= CASE g.room
            WHEN 'basic' THEN 1 WHEN 'premium' THEN 2 WHEN 'ultimate' THEN 3
            WHEN 'room4' THEN 4 WHEN 'room5' THEN 5 WHEN 'room6' THEN 6
            WHEN 'room7' THEN 7 WHEN 'room8' THEN 8 ELSE 99 END
      )
  )
);
CREATE POLICY "Groups admins create group services"
ON public.specialist_group_services FOR INSERT TO authenticated
WITH CHECK (private.admin_can_write('groups'));
CREATE POLICY "Groups admins update group services"
ON public.specialist_group_services FOR UPDATE TO authenticated
USING (private.admin_can_write('groups'))
WITH CHECK (private.admin_can_write('groups'));
CREATE POLICY "Groups admins delete group services"
ON public.specialist_group_services FOR DELETE TO authenticated
USING (private.admin_can_write('groups'));

CREATE TABLE public.group_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT private.txn_reference('GBK'),
  group_id uuid NOT NULL REFERENCES public.specialist_groups(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  service_name text NOT NULL,
  scheduled_for timestamptz,
  hours numeric(6,2) NOT NULL CHECK (hours > 0 AND hours <= 48),
  addons text[] NOT NULL DEFAULT '{}',
  notes text NOT NULL DEFAULT '',
  subtotal integer NOT NULL CHECK (subtotal > 0),
  platform_fee_pct numeric(5,2) NOT NULL CHECK (platform_fee_pct >= 0 AND platform_fee_pct <= 100),
  platform_fee integer NOT NULL CHECK (platform_fee >= 0),
  total integer NOT NULL CHECK (total = subtotal + platform_fee),
  status public.booking_status NOT NULL DEFAULT 'requested',
  paystack_reference text UNIQUE,
  paid_at timestamptz,
  allocation_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_bookings TO authenticated;
GRANT ALL ON public.group_bookings TO service_role;
ALTER TABLE public.group_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read their group bookings"
ON public.group_bookings FOR SELECT TO authenticated
USING (
  client_id = auth.uid()
  OR private.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.specialist_group_members gm
    WHERE gm.group_id = group_bookings.group_id
      AND gm.specialist_id = auth.uid() AND gm.active
  )
);
CREATE POLICY "Clients create their group bookings"
ON public.group_bookings FOR INSERT TO authenticated
WITH CHECK (client_id = auth.uid());
CREATE POLICY "Participants update their group bookings"
ON public.group_bookings FOR UPDATE TO authenticated
USING (
  client_id = auth.uid()
  OR private.admin_can_write('groups')
  OR EXISTS (
    SELECT 1 FROM public.specialist_group_members gm
    WHERE gm.group_id = group_bookings.group_id
      AND gm.specialist_id = auth.uid() AND gm.active
  )
)
WITH CHECK (
  client_id = auth.uid()
  OR private.admin_can_write('groups')
  OR EXISTS (
    SELECT 1 FROM public.specialist_group_members gm
    WHERE gm.group_id = group_bookings.group_id
      AND gm.specialist_id = auth.uid() AND gm.active
  )
);

CREATE TABLE public.group_booking_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_booking_id uuid NOT NULL REFERENCES public.group_bookings(id) ON DELETE RESTRICT,
  specialist_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  role_label text NOT NULL,
  is_lead boolean NOT NULL DEFAULT false,
  share_pct numeric(5,2) NOT NULL CHECK (share_pct > 0 AND share_pct <= 100),
  allocated_amount integer NOT NULL CHECK (allocated_amount >= 0),
  platform_fee integer NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
  payout_amount integer NOT NULL CHECK (payout_amount >= 0),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'declined', 'completed', 'cancelled', 'disputed', 'refunded')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_booking_id, specialist_id),
  CHECK (allocated_amount = payout_amount + platform_fee)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_booking_members TO authenticated;
GRANT ALL ON public.group_booking_members TO service_role;
ALTER TABLE public.group_booking_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read group booking allocations"
ON public.group_booking_members FOR SELECT TO authenticated
USING (
  specialist_id = auth.uid()
  OR private.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.group_bookings gb
    WHERE gb.id = group_booking_members.group_booking_id
      AND gb.client_id = auth.uid()
  )
);
CREATE POLICY "Groups admins manage group booking allocations"
ON public.group_booking_members FOR ALL TO authenticated
USING (private.admin_can_write('groups'))
WITH CHECK (private.admin_can_write('groups'));

CREATE TABLE public.thread_participants (
  thread_id uuid NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  participant_role text NOT NULL DEFAULT 'member' CHECK (participant_role IN ('client', 'lead', 'member')),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  hidden_at timestamptz,
  cleared_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.thread_participants TO authenticated;
GRANT ALL ON public.thread_participants TO service_role;
ALTER TABLE public.thread_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read shared thread roster"
ON public.thread_participants FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR private.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.thread_participants mine
    WHERE mine.thread_id = thread_participants.thread_id AND mine.user_id = auth.uid()
  )
);
CREATE POLICY "Participants update their shared thread state"
ON public.thread_participants FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR private.admin_can_write('groups'))
WITH CHECK (user_id = auth.uid() OR private.admin_can_write('groups'));
CREATE POLICY "Groups admins manage shared thread roster"
ON public.thread_participants FOR INSERT TO authenticated
WITH CHECK (private.admin_can_write('groups'));
CREATE POLICY "Groups admins remove shared thread members"
ON public.thread_participants FOR DELETE TO authenticated
USING (private.admin_can_write('groups'));

ALTER TABLE public.bookings
  ADD COLUMN group_booking_id uuid REFERENCES public.group_bookings(id) ON DELETE RESTRICT,
  ADD COLUMN group_booking_member_id uuid REFERENCES public.group_booking_members(id) ON DELETE RESTRICT;
ALTER TABLE public.escrow_entries
  ADD COLUMN group_booking_id uuid REFERENCES public.group_bookings(id) ON DELETE RESTRICT,
  ADD COLUMN group_booking_member_id uuid REFERENCES public.group_booking_members(id) ON DELETE RESTRICT;
ALTER TABLE public.threads
  ADD COLUMN group_booking_id uuid REFERENCES public.group_bookings(id) ON DELETE RESTRICT,
  ADD COLUMN is_group boolean NOT NULL DEFAULT false;
ALTER TABLE public.documents
  ADD COLUMN group_booking_id uuid REFERENCES public.group_bookings(id) ON DELETE SET NULL;

CREATE INDEX bookings_group_booking_idx ON public.bookings(group_booking_id) WHERE group_booking_id IS NOT NULL;
CREATE INDEX escrow_group_booking_idx ON public.escrow_entries(group_booking_id) WHERE group_booking_id IS NOT NULL;
CREATE INDEX escrow_paystack_reference_idx ON public.escrow_entries(paystack_reference) WHERE paystack_reference IS NOT NULL;
CREATE INDEX threads_group_booking_idx ON public.threads(group_booking_id) WHERE group_booking_id IS NOT NULL;
CREATE INDEX group_bookings_client_idx ON public.group_bookings(client_id, created_at DESC);
CREATE INDEX group_booking_members_specialist_idx ON public.group_booking_members(specialist_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.validate_specialist_group_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_members integer;
  active_leads integer;
  allocation numeric;
  active_services integer;
BEGIN
  IF NEW.active AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.active, false)) THEN
    SELECT count(*), count(*) FILTER (WHERE is_lead), COALESCE(sum(share_pct), 0)
      INTO active_members, active_leads, allocation
    FROM public.specialist_group_members
    WHERE group_id = NEW.id AND active;
    SELECT count(*) INTO active_services
    FROM public.specialist_group_services
    WHERE group_id = NEW.id AND active;
    IF active_members < 1 THEN RAISE EXCEPTION 'A group needs at least one active specialist before activation'; END IF;
    IF active_leads <> 1 THEN RAISE EXCEPTION 'A group needs exactly one active lead before activation'; END IF;
    IF allocation <> 100 THEN RAISE EXCEPTION 'Active group payout percentages must total 100'; END IF;
    IF active_services < 1 THEN RAISE EXCEPTION 'A group needs at least one active service before activation'; END IF;
    IF NEW.base_rate <= 0 THEN RAISE EXCEPTION 'An active group needs a positive rate'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_specialist_group_activation_trg
BEFORE INSERT OR UPDATE OF active ON public.specialist_groups
FOR EACH ROW EXECUTE FUNCTION private.validate_specialist_group_activation();

CREATE OR REPLACE FUNCTION private.prevent_active_group_structure_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_group uuid := COALESCE(NEW.group_id, OLD.group_id);
  group_active boolean;
BEGIN
  SELECT active INTO group_active FROM public.specialist_groups WHERE id = target_group;
  IF COALESCE(group_active, false) THEN
    RAISE EXCEPTION 'Deactivate the group before changing its roster, payout shares, or services';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER freeze_active_group_members_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.specialist_group_members
FOR EACH ROW EXECUTE FUNCTION private.prevent_active_group_structure_change();
CREATE TRIGGER freeze_active_group_services_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.specialist_group_services
FOR EACH ROW EXECUTE FUNCTION private.prevent_active_group_structure_change();

CREATE OR REPLACE FUNCTION private.in_thread(_thread_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.threads t
    WHERE t.id = _thread_id
      AND (t.client_id = auth.uid() OR t.specialist_id = auth.uid())
  ) OR EXISTS (
    SELECT 1 FROM public.thread_participants tp
    WHERE tp.thread_id = _thread_id AND tp.user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "Participants read their threads" ON public.threads;
CREATE POLICY "Participants read their threads"
ON public.threads FOR SELECT TO authenticated
USING (private.in_thread(id) OR private.is_admin());
DROP POLICY IF EXISTS "Participants update their threads" ON public.threads;
CREATE POLICY "Participants update their threads"
ON public.threads FOR UPDATE TO authenticated
USING (private.in_thread(id) OR private.is_admin())
WITH CHECK (private.in_thread(id) OR private.is_admin());

CREATE TRIGGER specialist_groups_updated_at
BEFORE UPDATE ON public.specialist_groups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER specialist_group_members_updated_at
BEFORE UPDATE ON public.specialist_group_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER specialist_group_services_updated_at
BEFORE UPDATE ON public.specialist_group_services
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER group_bookings_updated_at
BEFORE UPDATE ON public.group_bookings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER group_booking_members_updated_at
BEFORE UPDATE ON public.group_booking_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();