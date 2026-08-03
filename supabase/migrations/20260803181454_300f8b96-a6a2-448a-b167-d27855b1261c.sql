CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.txn_reference(_prefix text)
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = private, public
AS $$
  SELECT 'ASH-' || upper(_prefix) || '-' || lpad(nextval('public.txn_reference_seq')::text, 6, '0');
$$;

GRANT USAGE ON SCHEMA private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.txn_reference(text) TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.txn_reference_seq TO authenticated, service_role;

ALTER TABLE public.escrow_entries ALTER COLUMN reference SET DEFAULT private.txn_reference('ESC');
ALTER TABLE public.bookings ALTER COLUMN reference SET DEFAULT private.txn_reference('BKG');
ALTER TABLE public.expenses ALTER COLUMN txn_reference SET DEFAULT private.txn_reference('EXP');

DROP FUNCTION IF EXISTS public.txn_reference(text);