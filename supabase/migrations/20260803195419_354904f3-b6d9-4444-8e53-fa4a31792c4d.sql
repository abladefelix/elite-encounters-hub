ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS client_cleared_at timestamptz,
  ADD COLUMN IF NOT EXISTS specialist_cleared_at timestamptz;

DROP POLICY IF EXISTS "Authors delete own messages" ON public.messages;
CREATE POLICY "Authors delete own messages"
ON public.messages FOR DELETE
TO authenticated
USING (author_id = auth.uid());