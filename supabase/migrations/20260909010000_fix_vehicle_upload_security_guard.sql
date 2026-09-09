-- A CASE expression still resolves every NEW.field against the trigger's row
-- type. Vehicle photos have vehicle_id, not user_id, so the shared expression
-- rejected every photo insert before moderation could save it.
CREATE OR REPLACE FUNCTION public.security_upload_monitor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid;
  recent_count integer;
BEGIN
  IF TG_TABLE_NAME = 'documents' THEN
    actor := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'vehicle_photos' THEN
    SELECT owner_id INTO actor FROM public.vehicles WHERE id = NEW.vehicle_id;
  ELSE
    RAISE EXCEPTION 'Unsupported upload security table: %', TG_TABLE_NAME;
  END IF;

  IF actor IS NULL OR NOT public.security_setting_on('security_upload_validation', true) THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'documents' THEN
    SELECT count(*) INTO recent_count FROM public.documents
    WHERE user_id = actor AND created_at > now() - interval '1 hour';
  ELSE
    SELECT count(*) INTO recent_count
    FROM public.vehicle_photos vp JOIN public.vehicles v ON v.id = vp.vehicle_id
    WHERE v.owner_id = actor AND vp.created_at > now() - interval '1 hour';
  END IF;

  IF recent_count >= 20 THEN
    PERFORM public.add_security_event(actor, 'upload_burst', 'high',
      'Unusually frequent uploads detected',
      jsonb_build_object('count', recent_count, 'area', TG_TABLE_NAME));
    IF public.security_setting_on('security_auto_restrictions', false) THEN
      RAISE EXCEPTION 'Uploads are temporarily paused because of unusual activity. Try again later.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
