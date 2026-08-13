DELETE FROM public.threads t
WHERE NOT EXISTS (SELECT 1 FROM public.messages m WHERE m.thread_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.thread_id = t.id)
  AND EXISTS (
    SELECT 1 FROM public.threads o
    WHERE o.client_id = t.client_id AND o.specialist_id = t.specialist_id AND o.id <> t.id
      AND o.created_at < t.created_at
  );

CREATE UNIQUE INDEX IF NOT EXISTS threads_client_specialist_key
  ON public.threads (client_id, specialist_id);