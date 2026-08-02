CREATE OR REPLACE VIEW public.platform_settings_public
WITH (security_invoker = off) AS
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'branding', s.data -> 'branding',
    'locale',   s.data -> 'locale',
    'signup',   s.data -> 'signup',
    'features', s.data -> 'features',
    'rooms',    s.data -> 'rooms',
    'platform', s.data -> 'platform'
  )) AS data
  FROM public.platform_settings s
  WHERE s.id;

GRANT SELECT ON public.platform_settings_public TO anon, authenticated;
GRANT ALL ON public.platform_settings_public TO service_role;