ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS locality TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON public.profiles (lower(username)) WHERE username IS NOT NULL AND username <> '';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
BEGIN
  INSERT INTO public.profiles (
    id, display_name, city, username, phone, address, locality, extra,
    terms_accepted_at, privacy_accepted_at
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
    CASE WHEN meta->>'accepted_privacy' = 'true' THEN now() ELSE NULL END
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
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();