ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS client_hidden_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS specialist_hidden_at timestamp with time zone;