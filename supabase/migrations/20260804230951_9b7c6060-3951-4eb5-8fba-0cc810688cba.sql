CREATE TABLE public.active_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  auth_session_id text NOT NULL UNIQUE,
  device_id text NOT NULL,
  device_name text NOT NULL DEFAULT 'Unknown device',
  user_agent text NOT NULL DEFAULT '',
  ip_address text NOT NULL DEFAULT '',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT active_sessions_expiry_order CHECK (absolute_expires_at > created_at),
  CONSTRAINT active_sessions_device_id_length CHECK (char_length(device_id) BETWEEN 8 AND 200)
);

GRANT SELECT, DELETE ON public.active_sessions TO authenticated;
GRANT ALL ON public.active_sessions TO service_role;

ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their own sessions"
ON public.active_sessions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Members can end their own sessions"
ON public.active_sessions
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX active_sessions_user_active_idx
ON public.active_sessions (user_id, revoked_at, last_seen_at DESC);

CREATE INDEX active_sessions_expiry_idx
ON public.active_sessions (idle_expires_at, absolute_expires_at)
WHERE revoked_at IS NULL;

CREATE TRIGGER active_sessions_updated_at
BEFORE UPDATE ON public.active_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();