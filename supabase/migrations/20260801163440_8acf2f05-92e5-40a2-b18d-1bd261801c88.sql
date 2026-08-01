-- ============================================================ account status
DO $$ BEGIN
  CREATE TYPE public.account_status AS ENUM ('pending','active','deactivated','suspended','banned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.complaint_state AS ENUM ('open','reviewing','resolved','dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.document_kind AS ENUM ('invoice','receipt');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE public.message_kind ADD VALUE IF NOT EXISTS 'location';

-- ================================================================= profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status public.account_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS status_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ghana_card_number text,
  ADD COLUMN IF NOT EXISTS ghana_card_expiry date,
  ADD COLUMN IF NOT EXISTS ghana_card_front_url text,
  ADD COLUMN IF NOT EXISTS ghana_card_back_url text;

-- Normalised uniqueness: usernames, phones and Ghana card numbers are one-per-person.
-- Existing duplicates (test data) keep the oldest profile; later ones must re-enter a phone.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY regexp_replace(phone, '[^0-9]', '', 'g')
           ORDER BY created_at
         ) AS rn
    FROM public.profiles
   WHERE phone IS NOT NULL AND regexp_replace(phone, '[^0-9]', '', 'g') <> ''
)
UPDATE public.profiles p SET phone = NULL
  FROM ranked r WHERE r.id = p.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique
  ON public.profiles (regexp_replace(phone, '[^0-9]', '', 'g'))
  WHERE phone IS NOT NULL AND regexp_replace(phone, '[^0-9]', '', 'g') <> '';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_ghana_card_unique
  ON public.profiles (upper(regexp_replace(ghana_card_number, '[^A-Za-z0-9]', '', 'g')))
  WHERE ghana_card_number IS NOT NULL AND ghana_card_number <> '';

-- Members must never be able to lift their own suspension or ban.
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  NEW.room := OLD.room;
  NEW.vetting := OLD.vetting;
  NEW.verified := OLD.verified;
  NEW.suspended := OLD.suspended;
  NEW.rating := OLD.rating;
  NEW.jobs_completed := OLD.jobs_completed;
  NEW.account_status := OLD.account_status;
  NEW.status_reason := OLD.status_reason;
  NEW.status_changed_at := OLD.status_changed_at;
  RETURN NEW;
END;
$$;

-- Blocked accounts lose read access to other members and cannot chat.
CREATE OR REPLACE FUNCTION public.account_is_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT account_status IN ('active','pending') AND NOT suspended
       FROM public.profiles WHERE id = _user_id),
    false);
$$;

-- =============================================================== complaints
CREATE TABLE IF NOT EXISTS public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  contact_email text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'other',
  subject text NOT NULL,
  body text NOT NULL,
  thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  state public.complaint_state NOT NULL DEFAULT 'open',
  admin_note text NOT NULL DEFAULT '',
  resolution text NOT NULL DEFAULT '',
  handled_by uuid,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.complaints TO authenticated;
GRANT UPDATE ON public.complaints TO authenticated;
GRANT ALL ON public.complaints TO service_role;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read their own complaints" ON public.complaints;
CREATE POLICY "Members read their own complaints" ON public.complaints
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Members raise complaints" ON public.complaints;
CREATE POLICY "Members raise complaints" ON public.complaints
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins handle complaints" ON public.complaints;
CREATE POLICY "Admins handle complaints" ON public.complaints
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TRIGGER complaints_updated_at BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================ notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'system',
  link text NOT NULL DEFAULT '',
  broadcast_id uuid,
  sent_by uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT INSERT ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read their notifications" ON public.notifications;
CREATE POLICY "Members read their notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Members mark notifications read" ON public.notifications;
CREATE POLICY "Members mark notifications read" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins send notifications" ON public.notifications;
CREATE POLICY "Admins send notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS notifications_user_idx
  ON public.notifications (user_id, created_at DESC);

-- ======================================================= invoices & receipts
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  kind public.document_kind NOT NULL,
  client_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  specialist_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  escrow_id uuid REFERENCES public.escrow_entries(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  currency text NOT NULL DEFAULT 'GHS',
  subtotal integer NOT NULL DEFAULT 0,
  platform_fee integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  paystack_reference text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parties read their documents" ON public.documents;
CREATE POLICY "Parties read their documents" ON public.documents
  FOR SELECT TO authenticated
  USING (client_id = auth.uid() OR specialist_id = auth.uid() OR public.is_admin());

CREATE TRIGGER documents_updated_at BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE SEQUENCE IF NOT EXISTS public.document_number_seq;
GRANT USAGE ON SEQUENCE public.document_number_seq TO service_role;

-- ============================================================= activity log
CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_label text NOT NULL DEFAULT '',
  area text NOT NULL DEFAULT 'system',
  event text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  target text NOT NULL DEFAULT '',
  ip text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read the activity log" ON public.activity_log;
CREATE POLICY "Admins read the activity log" ON public.activity_log
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS activity_log_created_idx ON public.activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_area_idx ON public.activity_log (area, created_at DESC);

-- ================================== signup metadata carries the new fields
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
BEGIN
  INSERT INTO public.profiles (
    id, display_name, city, username, phone, address, locality, extra,
    terms_accepted_at, privacy_accepted_at,
    ghana_card_number, ghana_card_expiry
  )
  VALUES (
    NEW.id,
    COALESCE(NULLIF(meta->>'display_name', ''), split_part(NEW.email, '@', 1)),
    COALESCE(meta->>'city', ''),
    NULLIF(meta->>'username', ''),
    NULLIF(meta->>'phone', ''),
    COALESCE(meta->>'address', ''),
    COALESCE(meta->>'locality', ''),
    COALESCE(meta->'extra', '{}'::jsonb),
    CASE WHEN meta->>'accepted_terms' = 'true' THEN now() ELSE NULL END,
    CASE WHEN meta->>'accepted_privacy' = 'true' THEN now() ELSE NULL END,
    NULLIF(meta->>'ghana_card_number', ''),
    NULLIF(meta->>'ghana_card_expiry', '')::date
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE WHEN meta->>'role' = 'specialist' THEN 'specialist'::public.app_role
         ELSE 'client'::public.app_role END
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;