CREATE TABLE public.integration_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  value text NOT NULL DEFAULT '',
  is_secret boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_keys TO authenticated;
GRANT ALL ON public.integration_keys TO service_role;

ALTER TABLE public.integration_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage integration keys"
  ON public.integration_keys FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TRIGGER integration_keys_updated_at
  BEFORE UPDATE ON public.integration_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  area text NOT NULL,
  action text NOT NULL,
  target text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read the audit log"
  ON public.admin_audit_log FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins write the audit log"
  ON public.admin_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND actor_id = auth.uid());

CREATE INDEX admin_audit_log_created_at_idx ON public.admin_audit_log (created_at DESC);

INSERT INTO public.integration_keys (key, label, description, value, is_secret) VALUES
  ('paystack_public_key', 'Paystack public key', 'Publishable key used to open the Paystack checkout in the browser.', '', false),
  ('paystack_secret_key', 'Paystack secret key', 'Server-side key used to verify charges and trigger payouts.', '', true),
  ('paystack_webhook_secret', 'Paystack webhook secret', 'Shared secret Paystack signs webhook calls with.', '', true),
  ('livekit_url', 'LiveKit server URL', 'wss:// URL of the media server that carries voice and video calls.', '', false),
  ('livekit_api_key', 'LiveKit API key', 'API key used to mint call tokens.', '', true),
  ('livekit_api_secret', 'LiveKit API secret', 'API secret used to sign call tokens.', '', true);