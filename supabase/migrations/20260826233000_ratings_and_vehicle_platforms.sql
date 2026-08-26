ALTER TABLE public.profiles ALTER COLUMN rating SET DEFAULT 5.0;

CREATE OR REPLACE FUNCTION public.recalculate_profile_rating(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review_average numeric;
  v_review_count integer;
  v_upheld_reports integer;
  v_rating numeric;
BEGIN
  SELECT COALESCE(round(avg(r.rating)::numeric, 1), 5.0), count(*)::integer
  INTO v_review_average, v_review_count
  FROM public.reviews r
  WHERE r.reviewee_id = p_user_id;

  SELECT count(*)::integer INTO v_upheld_reports
  FROM public.reports
  WHERE reported_id = p_user_id AND status IN ('reviewing', 'resolved');

  v_rating := greatest(1.0, round((v_review_average - (v_upheld_reports * 0.1))::numeric, 1));
  PERFORM set_config('app.profile_system_update', 'on', true);
  UPDATE public.profiles
  SET rating = v_rating, rating_count = v_review_count
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_profile_rating(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.recalculate_rating_after_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.reported_id IS NOT NULL THEN PERFORM public.recalculate_profile_rating(OLD.reported_id); END IF;
    RETURN OLD;
  END IF;
  IF NEW.reported_id IS NOT NULL THEN PERFORM public.recalculate_profile_rating(NEW.reported_id); END IF;
  IF TG_OP = 'UPDATE' AND OLD.reported_id IS DISTINCT FROM NEW.reported_id AND OLD.reported_id IS NOT NULL THEN
    PERFORM public.recalculate_profile_rating(OLD.reported_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recalculate_rating_after_report_trigger ON public.reports;
CREATE TRIGGER recalculate_rating_after_report_trigger
AFTER INSERT OR UPDATE OF status, reported_id OR DELETE ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.recalculate_rating_after_report();

CREATE OR REPLACE FUNCTION public.submit_review(
  p_application_id uuid,
  p_rating int,
  p_content text DEFAULT NULL
)
RETURNS public.reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.applications%ROWTYPE;
  v_reviewee uuid;
  v_review public.reviews%ROWTYPE;
BEGIN
  IF p_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Rating must be between 1 and 5'; END IF;
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id;
  IF NOT FOUND OR v_app.status NOT IN ('accepted', 'completed') THEN
    RAISE EXCEPTION 'A completed match is required to leave a review';
  END IF;
  IF auth.uid() = v_app.driver_id THEN v_reviewee := v_app.owner_id;
  ELSIF auth.uid() = v_app.owner_id THEN v_reviewee := v_app.driver_id;
  ELSE RAISE EXCEPTION 'Not an application participant';
  END IF;

  INSERT INTO public.reviews (application_id, reviewer_id, reviewee_id, rating, content)
  VALUES (v_app.id, auth.uid(), v_reviewee, p_rating, nullif(trim(p_content), ''))
  RETURNING * INTO v_review;

  PERFORM public.recalculate_profile_rating(v_reviewee);
  PERFORM set_config('app.profile_system_update', 'on', true);
  UPDATE public.profiles p SET contracts_completed = (
    SELECT count(*) FROM public.applications a
    WHERE a.status = 'completed' AND (a.driver_id = p.id OR a.owner_id = p.id)
  ) WHERE p.id = v_reviewee;
  RETURN v_review;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_review(uuid, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_review(uuid, int, text) TO authenticated;

DO $$
DECLARE v_profile record;
BEGIN
  FOR v_profile IN SELECT id FROM public.profiles LOOP
    PERFORM public.recalculate_profile_rating(v_profile.id);
  END LOOP;
END;
$$;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS registered_platforms text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_registered_platforms_check;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_registered_platforms_check
  CHECK (registered_platforms <@ ARRAY['uber','bolt','little','faras','other']::text[]);

CREATE OR REPLACE FUNCTION public.protect_vehicle_approval_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.approval_status := 'pending'; NEW.approval_note := NULL;
    NEW.approved_at := NULL; NEW.approved_by := NULL;
    RETURN NEW;
  END IF;

  NEW.approval_status := OLD.approval_status;
  NEW.approval_note := OLD.approval_note;
  NEW.approved_at := OLD.approved_at;
  NEW.approved_by := OLD.approved_by;

  IF ROW(NEW.make, NEW.model, NEW.year, NEW.transmission, NEW.fuel_type,
         NEW.location, NEW.weekly_target, NEW.monthly_target, NEW.deposit,
         NEW.driver_experience, NEW.minimum_driver_experience_years,
         NEW.requirements, NEW.insurance_type, NEW.insurance_expiry,
         NEW.available_from, NEW.registered_platforms)
     IS DISTINCT FROM
     ROW(OLD.make, OLD.model, OLD.year, OLD.transmission, OLD.fuel_type,
         OLD.location, OLD.weekly_target, OLD.monthly_target, OLD.deposit,
         OLD.driver_experience, OLD.minimum_driver_experience_years,
         OLD.requirements, OLD.insurance_type, OLD.insurance_expiry,
         OLD.available_from, OLD.registered_platforms) THEN
    NEW.approval_status := 'pending'; NEW.approval_note := NULL;
    NEW.approved_at := NULL; NEW.approved_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;
