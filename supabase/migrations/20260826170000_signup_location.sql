-- Store the locality supplied during registration for both driver and owner
-- accounts. Kenya is implicit because GariLink operates only in Kenya.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, phone, email, location)
  VALUES (
    NEW.id,
    CASE
      WHEN NEW.raw_user_meta_data ->> 'role' IN ('driver', 'owner')
        THEN NEW.raw_user_meta_data ->> 'role'
      ELSE 'driver'
    END,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'phone', ''),
    NEW.email,
    NULLIF(trim(NEW.raw_user_meta_data ->> 'location'), '')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;
