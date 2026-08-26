-- Keep registration email private to the account owner and administrators,
-- make one year the minimum/default driver experience, and stop rewarding
-- short contracts in the public trust level.

REVOKE SELECT (email) ON public.profiles FROM authenticated;
REVOKE SELECT (email) ON public.profiles FROM anon;

UPDATE public.profiles
SET driving_experience_years = 1
WHERE driving_experience_years IS NULL OR driving_experience_years < 1;

ALTER TABLE public.profiles
  ALTER COLUMN driving_experience_years SET DEFAULT 1,
  ALTER COLUMN driving_experience_years SET NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_driving_experience_years_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_driving_experience_years_check
  CHECK (driving_experience_years BETWEEN 1 AND 60);

CREATE OR REPLACE FUNCTION public.validate_driver_about_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'driver' AND NEW.onboarding_completed
     AND (OLD.onboarding_completed IS DISTINCT FROM true)
     AND (
       length(trim(NEW.full_name)) < 2 OR
       length(trim(COALESCE(NEW.bio, ''))) < 20 OR
       length(trim(COALESCE(NEW.location, ''))) < 2 OR
       NEW.age IS NULL OR NEW.age < 18 OR NEW.age > 85 OR
       COALESCE(array_length(NEW.languages, 1), 0) = 0 OR
       NEW.driving_experience_years IS NULL OR NEW.driving_experience_years < 1
     )
  THEN
    RAISE EXCEPTION 'Complete your name, location, age, bio, languages, and at least one year of driving experience before publishing your profile';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_trust_passport(p_user_id uuid)
RETURNS TABLE (
  account_created_at timestamptz,
  contracts_completed integer,
  rating numeric,
  rating_count integer,
  approved_references bigint,
  approved_evidence bigint,
  approved_platform_history bigint,
  trust_level text,
  account_standing text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH signals AS (
    SELECT p.created_at, p.contracts_completed, p.rating, p.rating_count, p.is_suspended,
      (SELECT count(*) FROM public.documents d WHERE d.user_id = p.id AND d.verified AND d.type IN ('work_history','other_trust_evidence')) AS evidence,
      (SELECT count(*) FROM public.driver_platform_history h WHERE h.driver_id = p.id AND h.approved) AS history
    FROM public.profiles p WHERE p.id = p_user_id
  )
  SELECT created_at, contracts_completed, rating, rating_count, 0::bigint, evidence, history,
    CASE WHEN rating_count >= 3 OR evidence + history >= 3 THEN 'established'
         WHEN rating_count > 0 OR evidence + history > 0 THEN 'building' ELSE 'new' END,
    CASE WHEN is_suspended THEN 'restricted' ELSE 'good' END
  FROM signals;
$$;
