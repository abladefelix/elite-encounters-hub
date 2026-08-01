CREATE OR REPLACE FUNCTION public.protect_profile_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Admins and trusted server-side code (no end-user session) may set these.
  IF public.is_admin() OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.room := OLD.room;
  NEW.vetting := OLD.vetting;
  NEW.verified := OLD.verified;
  NEW.suspended := OLD.suspended;
  NEW.rating := OLD.rating;
  NEW.jobs_completed := OLD.jobs_completed;
  NEW.account_status := OLD.account_status;
  NEW.status_reason := OLD.status_reason;
  NEW.status_changed_at := OLD.status_changed_at;
  RETURN NEW;
END;
$function$;