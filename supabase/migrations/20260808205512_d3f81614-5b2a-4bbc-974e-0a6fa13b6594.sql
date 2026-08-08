ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS ack_requested_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamp with time zone;