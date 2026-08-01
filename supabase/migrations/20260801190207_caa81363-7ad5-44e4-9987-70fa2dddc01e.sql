CREATE OR REPLACE FUNCTION public.moderate_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg jsonb := public.settings_section('moderation');
  exempt boolean := FALSE;
  body text := NEW.body;
  masked text := NEW.body;
  cats text[] := '{}'::text[];
  terms text[] := '{}'::text[];
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
      cats := array_append(cats, 'phone'::text);
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
      cats := array_append(cats, 'contact'::text);
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
        terms := array_append(terms, word::text);
        action := COALESCE(cfg->>'flaggedWordsAction', 'warn');
        IF action = 'block' THEN worst := 'block';
        ELSIF action = 'mask' THEN
          masked := replace(masked, word, repeat('*', length(word)));
          IF worst <> 'block' THEN worst := 'mask'; END IF;
        END IF;
      END IF;
    END LOOP;
    IF array_length(terms, 1) > 0 THEN cats := array_append(cats, 'word'::text); END IF;
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
$function$;