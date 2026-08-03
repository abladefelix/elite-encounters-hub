CREATE OR REPLACE FUNCTION public.txn_reference(_prefix text)
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'ASH-' || upper(_prefix) || '-' || lpad(nextval('public.txn_reference_seq')::text, 6, '0');
$$;

GRANT EXECUTE ON FUNCTION public.txn_reference(text) TO authenticated, service_role;