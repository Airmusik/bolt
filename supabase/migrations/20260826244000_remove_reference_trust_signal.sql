-- Keep the established RPC shape for compatibility, but references no longer
-- contribute to the public trust score or evidence count.
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
    CASE WHEN contracts_completed >= 3 OR rating_count >= 3 OR evidence + history >= 3 THEN 'established'
         WHEN contracts_completed > 0 OR rating_count > 0 OR evidence + history > 0 THEN 'building' ELSE 'new' END,
    CASE WHEN is_suspended THEN 'restricted' ELSE 'good' END
  FROM signals;
$$;
