-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('client', 'specialist', 'admin');
CREATE TYPE public.tier AS ENUM ('basic', 'premium', 'ultimate');
CREATE TYPE public.vetting_status AS ENUM ('pending', 'in_review', 'approved', 'rejected');
CREATE TYPE public.booking_status AS ENUM ('requested', 'accepted', 'paid', 'completed', 'cancelled', 'disputed');
CREATE TYPE public.membership_status AS ENUM ('active', 'past_due', 'cancelled');
CREATE TYPE public.message_kind AS ENUM ('text', 'system', 'booking', 'gift');
CREATE TYPE public.escrow_state AS ENUM ('pending', 'held', 'clearing', 'released', 'disputed', 'refunded');
CREATE TYPE public.escrow_kind AS ENUM ('booking', 'gift', 'membership');
CREATE TYPE public.report_state AS ENUM ('open', 'reviewing', 'actioned', 'dismissed');
CREATE TYPE public.background_check AS ENUM ('clear', 'pending', 'flagged');

-- ============ SHARED TRIGGER ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  phone TEXT,
  likes TEXT[] NOT NULL DEFAULT '{}',
  dislikes TEXT[] NOT NULL DEFAULT '{}',
  languages TEXT[] NOT NULL DEFAULT '{}',
  hourly_rate INTEGER NOT NULL DEFAULT 0,
  years_experience INTEGER NOT NULL DEFAULT 0,
  response_minutes INTEGER NOT NULL DEFAULT 30,
  room public.tier,
  vetting public.vetting_status NOT NULL DEFAULT 'pending',
  rating NUMERIC(3,2) NOT NULL DEFAULT 0,
  jobs_completed INTEGER NOT NULL DEFAULT 0,
  verified BOOLEAN NOT NULL DEFAULT false,
  available BOOLEAN NOT NULL DEFAULT true,
  suspended BOOLEAN NOT NULL DEFAULT false,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin');
$$;

CREATE OR REPLACE FUNCTION public.current_room()
RETURNS public.tier
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT room FROM public.profiles WHERE id = auth.uid();
$$;

-- profiles policies
CREATE POLICY "Signed-in members can read profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Members can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Admins manage all profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- lock down self-escalation of privileged profile columns
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS TRIGGER
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
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_profiles BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- user_roles policies
CREATE POLICY "Members can read their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "Admins manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- auto-create profile + default client role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, city)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'city', '')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE WHEN NEW.raw_user_meta_data->>'role' = 'specialist' THEN 'specialist'::public.app_role
         ELSE 'client'::public.app_role END
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ SERVICES ============
CREATE TABLE public.services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  base_rate INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.services TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active services"
  ON public.services FOR SELECT USING (active OR public.is_admin());
CREATE POLICY "Admins manage services"
  ON public.services FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER services_updated_at BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.specialist_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  specialist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (specialist_id, service_id)
);
GRANT SELECT, INSERT, DELETE ON public.specialist_services TO authenticated;
GRANT ALL ON public.specialist_services TO service_role;
ALTER TABLE public.specialist_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in members can read specialist services"
  ON public.specialist_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "Specialists manage their own services"
  ON public.specialist_services FOR ALL TO authenticated
  USING (specialist_id = auth.uid() OR public.is_admin())
  WITH CHECK (specialist_id = auth.uid() OR public.is_admin());

-- ============ APPLICATIONS (vetting) ============
CREATE TABLE public.applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  applied_role public.app_role NOT NULL DEFAULT 'specialist',
  pitch TEXT NOT NULL DEFAULT '',
  years_experience INTEGER NOT NULL DEFAULT 0,
  id_verified BOOLEAN NOT NULL DEFAULT false,
  background_check public.background_check NOT NULL DEFAULT 'pending',
  reference_checks INTEGER NOT NULL DEFAULT 0,
  suggested_room public.tier NOT NULL DEFAULT 'basic',
  admin_note TEXT NOT NULL DEFAULT '',
  status public.vetting_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.applications TO authenticated;
GRANT INSERT ON public.applications TO anon;
GRANT ALL ON public.applications TO service_role;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can apply"
  ON public.applications FOR INSERT WITH CHECK (true);
CREATE POLICY "Applicants read their own application"
  ON public.applications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "Admins manage applications"
  ON public.applications FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER applications_updated_at BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ MEMBERSHIPS ============
CREATE TABLE public.memberships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room public.tier NOT NULL,
  status public.membership_status NOT NULL DEFAULT 'active',
  amount INTEGER NOT NULL DEFAULT 0,
  paystack_reference TEXT,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.memberships TO authenticated;
GRANT ALL ON public.memberships TO service_role;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read their own memberships"
  ON public.memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "Admins manage memberships"
  ON public.memberships FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER memberships_updated_at BEFORE UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ THREADS + MESSAGES ============
CREATE TABLE public.threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  specialist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  room public.tier,
  last_message TEXT NOT NULL DEFAULT '',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  specialist_last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  contact_exempt BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, specialist_id)
);
GRANT SELECT, INSERT, UPDATE ON public.threads TO authenticated;
GRANT ALL ON public.threads TO service_role;
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read their threads"
  ON public.threads FOR SELECT TO authenticated
  USING (client_id = auth.uid() OR specialist_id = auth.uid() OR public.is_admin());
CREATE POLICY "Members start threads they are in"
  ON public.threads FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid() OR specialist_id = auth.uid());
CREATE POLICY "Participants update their threads"
  ON public.threads FOR UPDATE TO authenticated
  USING (client_id = auth.uid() OR specialist_id = auth.uid() OR public.is_admin())
  WITH CHECK (client_id = auth.uid() OR specialist_id = auth.uid() OR public.is_admin());
CREATE TRIGGER threads_updated_at BEFORE UPDATE ON public.threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.in_thread(_thread_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.threads t
    WHERE t.id = _thread_id
      AND (t.client_id = auth.uid() OR t.specialist_id = auth.uid())
  );
$$;

CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  body TEXT NOT NULL DEFAULT '',
  kind public.message_kind NOT NULL DEFAULT 'text',
  attachment_url TEXT,
  attachment_name TEXT,
  booking_id UUID,
  escrow_id UUID,
  redacted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_thread_created_idx ON public.messages (thread_id, created_at);
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read thread messages"
  ON public.messages FOR SELECT TO authenticated
  USING (public.in_thread(thread_id) OR public.is_admin());
CREATE POLICY "Participants send messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (public.in_thread(thread_id) AND (author_id = auth.uid() OR author_id IS NULL));
CREATE POLICY "Admins manage messages"
  ON public.messages FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- keep thread preview fresh
CREATE OR REPLACE FUNCTION public.touch_thread()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.threads
     SET last_message = left(NEW.body, 240),
         last_message_at = NEW.created_at,
         updated_at = now()
   WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER messages_touch_thread AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_thread();

-- ============ BOOKINGS ============
CREATE TABLE public.bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID REFERENCES public.threads(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  specialist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  service_name TEXT NOT NULL DEFAULT '',
  scheduled_for TIMESTAMPTZ,
  hours NUMERIC(5,2) NOT NULL DEFAULT 1,
  rate INTEGER NOT NULL DEFAULT 0,
  addons TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  platform_fee_pct NUMERIC(5,2) NOT NULL DEFAULT 12,
  status public.booking_status NOT NULL DEFAULT 'requested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read their bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (client_id = auth.uid() OR specialist_id = auth.uid() OR public.is_admin());
CREATE POLICY "Clients create bookings"
  ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid());
CREATE POLICY "Participants update their bookings"
  ON public.bookings FOR UPDATE TO authenticated
  USING (client_id = auth.uid() OR specialist_id = auth.uid() OR public.is_admin())
  WITH CHECK (client_id = auth.uid() OR specialist_id = auth.uid() OR public.is_admin());
CREATE TRIGGER bookings_updated_at BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ESCROW ============
CREATE TABLE public.escrow_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind public.escrow_kind NOT NULL DEFAULT 'booking',
  thread_id UUID REFERENCES public.threads(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  specialist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  gift_key TEXT,
  amount INTEGER NOT NULL,
  platform_fee INTEGER NOT NULL DEFAULT 0,
  payout_amount INTEGER NOT NULL DEFAULT 0,
  state public.escrow_state NOT NULL DEFAULT 'pending',
  hold_hours INTEGER NOT NULL DEFAULT 48,
  paystack_reference TEXT,
  paid_at TIMESTAMPTZ,
  release_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  dispute_reason TEXT,
  disputed_at TIMESTAMPTZ,
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.escrow_entries TO authenticated;
GRANT ALL ON public.escrow_entries TO service_role;
ALTER TABLE public.escrow_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read their escrow"
  ON public.escrow_entries FOR SELECT TO authenticated
  USING (client_id = auth.uid() OR specialist_id = auth.uid() OR public.is_admin());
CREATE POLICY "Clients create escrow entries"
  ON public.escrow_entries FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid());
CREATE POLICY "Participants update their escrow"
  ON public.escrow_entries FOR UPDATE TO authenticated
  USING (client_id = auth.uid() OR specialist_id = auth.uid() OR public.is_admin())
  WITH CHECK (client_id = auth.uid() OR specialist_id = auth.uid() OR public.is_admin());
CREATE TRIGGER escrow_updated_at BEFORE UPDATE ON public.escrow_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ MODERATION ============
CREATE TABLE public.moderation_hits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID REFERENCES public.threads(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  original_body TEXT NOT NULL DEFAULT '',
  categories TEXT[] NOT NULL DEFAULT '{}',
  terms TEXT[] NOT NULL DEFAULT '{}',
  action TEXT NOT NULL DEFAULT 'warn',
  reviewed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.moderation_hits TO authenticated;
GRANT INSERT ON public.moderation_hits TO authenticated;
GRANT ALL ON public.moderation_hits TO service_role;
ALTER TABLE public.moderation_hits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read moderation hits"
  ON public.moderation_hits FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Members log their own hits"
  ON public.moderation_hits FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "Admins manage moderation hits"
  ON public.moderation_hits FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============ REPORTS ============
CREATE TABLE public.reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID REFERENCES public.threads(id) ON DELETE SET NULL,
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  blocked BOOLEAN NOT NULL DEFAULT false,
  excerpt TEXT NOT NULL DEFAULT '',
  state public.report_state NOT NULL DEFAULT 'open',
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reporters read their reports"
  ON public.reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.is_admin());
CREATE POLICY "Members file reports"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "Admins manage reports"
  ON public.reports FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER reports_updated_at BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ RATINGS ============
CREATE TABLE public.ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID REFERENCES public.threads(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  rater_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rated_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ratings TO authenticated;
GRANT ALL ON public.ratings TO service_role;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in members read ratings"
  ON public.ratings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members rate as themselves"
  ON public.ratings FOR INSERT TO authenticated
  WITH CHECK (rater_id = auth.uid());
CREATE POLICY "Members update their own rating"
  ON public.ratings FOR UPDATE TO authenticated
  USING (rater_id = auth.uid()) WITH CHECK (rater_id = auth.uid());
CREATE POLICY "Admins manage ratings"
  ON public.ratings FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- stars must be 1..5
CREATE OR REPLACE FUNCTION public.validate_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.stars < 1 OR NEW.stars > 5 THEN
    RAISE EXCEPTION 'stars must be between 1 and 5';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ratings_validate BEFORE INSERT OR UPDATE ON public.ratings
  FOR EACH ROW EXECUTE FUNCTION public.validate_rating();

-- roll the specialist's average rating onto their profile
CREATE OR REPLACE FUNCTION public.refresh_profile_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target UUID := COALESCE(NEW.rated_id, OLD.rated_id);
BEGIN
  UPDATE public.profiles p
     SET rating = COALESCE((SELECT round(avg(stars)::numeric, 2) FROM public.ratings WHERE rated_id = target), 0)
   WHERE p.id = target;
  RETURN NULL;
END;
$$;
CREATE TRIGGER ratings_refresh_profile
  AFTER INSERT OR UPDATE OR DELETE ON public.ratings
  FOR EACH ROW EXECUTE FUNCTION public.refresh_profile_rating();

-- ============ PLATFORM SETTINGS (admin-owned single row) ============
CREATE TABLE public.platform_settings (
  id BOOLEAN NOT NULL PRIMARY KEY DEFAULT true,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_settings_singleton CHECK (id)
);
GRANT SELECT ON public.platform_settings TO authenticated, anon;
GRANT INSERT, UPDATE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read platform settings"
  ON public.platform_settings FOR SELECT USING (true);
CREATE POLICY "Admins manage platform settings"
  ON public.platform_settings FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER platform_settings_updated_at BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.platform_settings (id, data) VALUES (true, '{}'::jsonb);

-- ============ REALTIME ============
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.threads REPLICA IDENTITY FULL;
ALTER TABLE public.escrow_entries REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.escrow_entries;