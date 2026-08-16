CREATE TABLE public.system_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'client',
  severity text NOT NULL DEFAULT 'error',
  message text NOT NULL,
  stack text NOT NULL DEFAULT '',
  route text NOT NULL DEFAULT '',
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  occurrences integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'open',
  suggested_repair text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE, DELETE ON public.system_errors TO authenticated;
GRANT ALL ON public.system_errors TO service_role;
ALTER TABLE public.system_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read app errors" ON public.system_errors FOR SELECT TO authenticated USING (private.is_admin());
CREATE POLICY "Admins update app errors" ON public.system_errors FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "Admins clear app errors" ON public.system_errors FOR DELETE TO authenticated USING (private.is_admin());

CREATE INDEX system_errors_last_seen_idx ON public.system_errors (last_seen_at DESC);

CREATE TABLE public.repair_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_key text NOT NULL,
  label text NOT NULL,
  risk text NOT NULL DEFAULT 'safe',
  status text NOT NULL DEFAULT 'pending',
  detected integer NOT NULL DEFAULT 0,
  applied integer NOT NULL DEFAULT 0,
  summary text NOT NULL DEFAULT '',
  detail text NOT NULL DEFAULT '',
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_id uuid REFERENCES public.system_errors(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  auto boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);

GRANT SELECT, UPDATE, DELETE ON public.repair_runs TO authenticated;
GRANT ALL ON public.repair_runs TO service_role;
ALTER TABLE public.repair_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read repair runs" ON public.repair_runs FOR SELECT TO authenticated USING (private.is_admin());
CREATE POLICY "Admins update repair runs" ON public.repair_runs FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "Admins clear repair runs" ON public.repair_runs FOR DELETE TO authenticated USING (private.is_admin());

CREATE INDEX repair_runs_created_idx ON public.repair_runs (created_at DESC);

CREATE TRIGGER repair_runs_updated_at BEFORE UPDATE ON public.repair_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();