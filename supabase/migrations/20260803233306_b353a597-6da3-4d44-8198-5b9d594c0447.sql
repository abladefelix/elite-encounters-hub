UPDATE public.profiles
SET extra = jsonb_set(COALESCE(extra, '{}'::jsonb), '{portfolio_video}', to_jsonb('ff3ae08a-1a9f-4191-a739-22a73687557e/portfolio/video-1785799589353-Savetik-Net_7514761081202478392_v3.mp4'::text), true)
WHERE id = 'ff3ae08a-1a9f-4191-a739-22a73687557e';