-- Preserve the required signup languages in profiles created by the auth
-- trigger, and require complete names/two languages when a new driver makes
-- their profile public.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_languages text[];
BEGIN
  v_role := CASE WHEN NEW.raw_user_meta_data ->> 'role' IN ('driver', 'owner')
    THEN NEW.raw_user_meta_data ->> 'role' ELSE 'driver' END;

  SELECT COALESCE(array_agg(trim(language)) FILTER (WHERE length(trim(language)) > 0), '{}'::text[])
  INTO v_languages
  FROM jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(NEW.raw_user_meta_data -> 'languages') = 'array'
        THEN NEW.raw_user_meta_data -> 'languages'
      ELSE '[]'::jsonb
    END
  ) AS supplied(language);

  INSERT INTO public.profiles (
    id, role, full_name, phone, email, location, languages, onboarding_completed
  )
  VALUES (
    NEW.id,
    v_role,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'phone', ''),
    NEW.email,
    NULLIF(trim(NEW.raw_user_meta_data ->> 'location'), ''),
    v_languages,
    v_role <> 'driver'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_driver_about_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'driver' AND NEW.onboarding_completed
     AND (OLD.onboarding_completed IS DISTINCT FROM true)
     AND (
       COALESCE(array_length(regexp_split_to_array(trim(NEW.full_name), E'\\s+'), 1), 0) < 2 OR
       length(trim(COALESCE(NEW.bio, ''))) < 20 OR
       length(trim(COALESCE(NEW.location, ''))) < 2 OR
       NEW.age IS NULL OR NEW.age < 18 OR NEW.age > 85 OR
       COALESCE(array_length(NEW.languages, 1), 0) < 2 OR
       NEW.driving_experience_years IS NULL OR NEW.driving_experience_years < 1
     )
  THEN
    RAISE EXCEPTION 'Complete your first and second name, location, age, bio, at least two languages, and at least one year of driving experience before publishing your profile';
  END IF;
  RETURN NEW;
END;
$$;
