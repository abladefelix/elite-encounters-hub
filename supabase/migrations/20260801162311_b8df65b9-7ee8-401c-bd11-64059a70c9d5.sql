-- 1. Escrow: only admins / service role may mutate money state
DROP POLICY IF EXISTS "Participants update their escrow" ON public.escrow_entries;
CREATE POLICY "Admins update escrow" ON public.escrow_entries
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 2. Bookings: participants may not self-mark as paid or rewrite a paid price
CREATE OR REPLACE FUNCTION public.protect_booking_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;
  IF NEW.status = 'paid' AND OLD.status <> 'paid' THEN
    RAISE EXCEPTION 'Only the payment server can mark a booking as paid';
  END IF;
  IF OLD.status IN ('paid','completed') THEN
    NEW.rate := OLD.rate;
    NEW.hours := OLD.hours;
    NEW.platform_fee_pct := OLD.platform_fee_pct;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_bookings ON public.bookings;
CREATE TRIGGER protect_bookings BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.protect_booking_columns();

-- 3. Settings helper for server-side rules
CREATE OR REPLACE FUNCTION public.settings_section(_section text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(data -> _section, '{}'::jsonb) FROM public.platform_settings WHERE id;
$$;

-- 4. Server-side chat moderation
CREATE OR REPLACE FUNCTION public.moderate_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg jsonb := public.settings_section('moderation');
  exempt boolean := FALSE;
  body text := NEW.body;
  masked text := NEW.body;
  cats text[] := '{}';
  terms text[] := '{}';
  worst text := 'warn';
  word text;
  action text;
BEGIN
  IF NEW.kind <> 'text' OR COALESCE((cfg->>'enabled')::boolean, TRUE) IS FALSE THEN
    RETURN NEW;
  END IF;

  SELECT t.contact_exempt INTO exempt FROM public.threads t WHERE t.id = NEW.thread_id;
  exempt := COALESCE(exempt, FALSE);

  -- phone numbers
  IF NOT exempt AND COALESCE((cfg->>'blockPhoneNumbers')::boolean, TRUE) THEN
    IF body ~* '(\+?\d[\d\s().-]{7,}\d)'
       OR body ~* '((zero|one|two|three|four|five|six|seven|eight|nine)[\s,-]+){6,}' THEN
      action := COALESCE(cfg->>'phoneAction', 'block');
      cats := cats || 'phone';
      IF action = 'block' THEN worst := 'block';
      ELSIF action = 'mask' THEN
        masked := regexp_replace(masked, '(\+?\d[\d\s().-]{7,}\d)', '[hidden]', 'g');
        IF worst <> 'block' THEN worst := 'mask'; END IF;
      END IF;
    END IF;
  END IF;

  -- emails, links, social handles
  IF NOT exempt AND COALESCE((cfg->>'blockContactSharing')::boolean, TRUE) THEN
    IF body ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}'
       OR body ~* '(https?://|www\.)[[:alnum:]]'
       OR body ~* '(whatsapp|telegram|snapchat|instagram|ig handle|signal)\s*[:@]?\s*[[:alnum:]_+.]{3,}' THEN
      action := COALESCE(cfg->>'contactAction', 'mask');
      cats := cats || 'contact';
      IF action = 'block' THEN worst := 'block';
      ELSIF action = 'mask' THEN
        masked := regexp_replace(masked, '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,}', '[hidden]', 'gi');
        masked := regexp_replace(masked, '(https?://|www\.)[^\s]+', '[link removed]', 'gi');
        IF worst <> 'block' THEN worst := 'mask'; END IF;
      END IF;
    END IF;
  END IF;

  -- flagged words
  IF COALESCE((cfg->>'flaggedWordsEnabled')::boolean, TRUE) THEN
    FOR word IN
      SELECT value FROM jsonb_array_elements_text(COALESCE(cfg->'flaggedWords', '[]'::jsonb))
    LOOP
      IF word <> '' AND body ILIKE '%' || word || '%' THEN
        terms := terms || word;
        action := COALESCE(cfg->>'flaggedWordsAction', 'warn');
        IF action = 'block' THEN worst := 'block';
        ELSIF action = 'mask' THEN
          masked := replace(masked, word, repeat('*', length(word)));
          IF worst <> 'block' THEN worst := 'mask'; END IF;
        END IF;
      END IF;
    END LOOP;
    IF array_length(terms, 1) > 0 THEN cats := cats || 'word'; END IF;
  END IF;

  IF array_length(cats, 1) IS NULL THEN RETURN NEW; END IF;

  IF COALESCE((cfg->>'logHits')::boolean, TRUE) THEN
    INSERT INTO public.moderation_hits (thread_id, author_id, original_body, categories, terms, action)
    VALUES (NEW.thread_id, NEW.author_id, body, cats, terms, worst);
  END IF;

  IF worst = 'block' THEN
    RAISE EXCEPTION 'ASHNIGHT_MODERATION_BLOCKED: message withheld — contact details or flagged wording are not allowed in chat';
  END IF;

  IF worst = 'mask' THEN
    NEW.body := masked;
    NEW.redacted := TRUE;
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS moderate_messages ON public.messages;
CREATE TRIGGER moderate_messages BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.moderate_message();