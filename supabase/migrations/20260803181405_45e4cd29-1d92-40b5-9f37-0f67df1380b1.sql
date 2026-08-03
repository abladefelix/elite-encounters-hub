CREATE SEQUENCE IF NOT EXISTS public.txn_reference_seq START 1000;

CREATE OR REPLACE FUNCTION public.txn_reference(_prefix text)
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'ASH-' || upper(_prefix) || '-' || lpad(nextval('public.txn_reference_seq')::text, 6, '0');
$$;

ALTER TABLE public.escrow_entries
  ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS txn_reference text;

UPDATE public.escrow_entries SET reference = public.txn_reference('ESC') WHERE reference IS NULL;
UPDATE public.bookings SET reference = public.txn_reference('BKG') WHERE reference IS NULL;
UPDATE public.expenses SET txn_reference = public.txn_reference('EXP') WHERE txn_reference IS NULL;

ALTER TABLE public.escrow_entries
  ALTER COLUMN reference SET DEFAULT public.txn_reference('ESC'),
  ALTER COLUMN reference SET NOT NULL;
ALTER TABLE public.bookings
  ALTER COLUMN reference SET DEFAULT public.txn_reference('BKG'),
  ALTER COLUMN reference SET NOT NULL;
ALTER TABLE public.expenses
  ALTER COLUMN txn_reference SET DEFAULT public.txn_reference('EXP'),
  ALTER COLUMN txn_reference SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS escrow_entries_reference_key ON public.escrow_entries (reference);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_reference_key ON public.bookings (reference);
CREATE UNIQUE INDEX IF NOT EXISTS expenses_txn_reference_key ON public.expenses (txn_reference);

-- References are system-assigned: members and specialists must not rewrite them.
CREATE OR REPLACE FUNCTION public.freeze_txn_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'expenses' THEN
    NEW.txn_reference := OLD.txn_reference;
  ELSE
    NEW.reference := OLD.reference;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS freeze_escrow_reference ON public.escrow_entries;
CREATE TRIGGER freeze_escrow_reference BEFORE UPDATE ON public.escrow_entries
  FOR EACH ROW EXECUTE FUNCTION public.freeze_txn_reference();

DROP TRIGGER IF EXISTS freeze_booking_reference ON public.bookings;
CREATE TRIGGER freeze_booking_reference BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.freeze_txn_reference();

DROP TRIGGER IF EXISTS freeze_expense_reference ON public.expenses;
CREATE TRIGGER freeze_expense_reference BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.freeze_txn_reference();

REVOKE EXECUTE ON FUNCTION public.txn_reference(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.txn_reference(text) TO service_role;