DO $$ BEGIN
  CREATE TYPE public.payout_request_state AS ENUM ('none','requested','approved','declined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.escrow_entries
  ADD COLUMN IF NOT EXISTS payout_request_state public.payout_request_state NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS payout_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_request_note text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS escrow_entries_payout_request_idx
  ON public.escrow_entries (payout_request_state)
  WHERE payout_request_state = 'requested';