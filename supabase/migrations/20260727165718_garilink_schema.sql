/*
# GariLink Core Schema

## Overview
Creates the full database for GariLink — a platform connecting verified car owners
with ride-hailing drivers (Uber/Bolt/Faras/Little) across Kenya. GariLink only
connects parties; it does NOT process payments between users.

## Authentication model
Uses Supabase built-in auth.users with the user's real email and password.
The Kenyan phone number is stored separately on the user's profile.

## New Tables
1. `profiles` — extends auth.users with role, verification, rating, location,
   licence/PSV/good-conduct expiry (shown to others when browsing), bio, languages.
2. `vehicles` — owner car listings with make/model/year/transmission/fuel,
   location, weekly/monthly target, deposit, driver requirements, insurance
   type + expiry, availability, status.
3. `vehicle_photos` — ordered photo list per vehicle.
4. `vehicle_issues` — known issues the owner discloses so drivers aren't caught
   unaware (e.g. "left mirror cracked", severity).
5. `documents` — uploaded verification files (ID, licence, PSV, good conduct,
   logbook, business). Private to the owner; admin can view.
6. `driver_platform_history` — per-platform (Uber/Bolt/Little/Faras) work
   history for the last 5 months (months active, trips, rating, proof file).
7. `applications` — a driver applying to a vehicle; status pending/accepted/
   rejected. A conversation is created only after acceptance.
8. `conversations` — chat thread between driver and owner for a vehicle, linked
   to the accepted application.
9. `messages` — messages in a conversation (text/image/file), with read flag.
10. `reviews` — rating + written review, only allowed after an accepted match.
11. `notifications` — per-user notifications (application, message, verification,
    listing expiry, etc.).
12. `reports` — report a user / listing / conversation for moderation.
13. `blocks` — block another user.
14. `favorites` — driver's saved vehicle listings.

## Security (RLS)
- All tables have RLS enabled.
- Profiles: any authenticated user can read (needed to browse drivers/owners);
  users update only their own row.
- Vehicles/photos/issues: any authenticated user can read (browse); only the
  owner can insert/update/delete their own.
- Documents: only the owning user (and admin) can read; owner can insert/update/
  delete their own.
- Driver platform history: readable by all authenticated (shown on profile);
  owner writes own.
- Applications: driver and vehicle owner can read their own; driver inserts own;
  owner updates status of applications on their vehicles.
- Conversations: only the two participants can read; either participant inserts.
- Messages: only participants can read; sender inserts; sender updates read flag.
- Reviews: readable by all; reviewer inserts own; cannot be edited/deleted.
- Notifications: owner reads/updates/deletes own.
- Reports: reporter inserts; reporter + admin read.
- Blocks: owner reads/inserts/deletes own.
- Favorites: owner reads/inserts/deletes own.

## Storage
- Creates public bucket `vehicle-photos` for vehicle photos and avatars.
- Creates private bucket `documents` for verification files.

## Notes
1. Owner columns default to `auth.uid()` so client inserts that omit the owner
   still satisfy INSERT WITH CHECK policies.
2. Expiry fields live directly on profiles/vehicles so they can be displayed to
   other users browsing without exposing the private document files.
3. `is_admin()` helper checks the admin role on the profile.
*/

-- ---------- profiles ----------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'driver' CHECK (role IN ('owner','driver','admin')),
  full_name text NOT NULL DEFAULT '',
  phone text UNIQUE,
  avatar_url text,
  bio text,
  location text,
  preferred_locations text[] DEFAULT '{}',
  availability text DEFAULT 'available',
  languages text[] DEFAULT '{}',
  age int,
  driving_experience_years int DEFAULT 0,
  platforms_worked text[] DEFAULT '{}',
  id_number text,
  licence_number text,
  licence_expiry date,
  psv_badge_expiry date,
  good_conduct_expiry date,
  is_verified boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','pending','approved','rejected')),
  rating numeric(2,1) NOT NULL DEFAULT 0,
  rating_count int NOT NULL DEFAULT 0,
  contracts_completed int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_read_all" ON public.profiles;
CREATE POLICY "profiles_read_all" ON public.profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ---------- helper: is current user an admin? ----------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ---------- vehicles ----------
CREATE TABLE IF NOT EXISTS public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  make text NOT NULL,
  model text NOT NULL,
  year int NOT NULL,
  transmission text NOT NULL DEFAULT 'automatic' CHECK (transmission IN ('automatic','manual')),
  fuel_type text NOT NULL DEFAULT 'petrol' CHECK (fuel_type IN ('petrol','diesel','hybrid','electric')),
  location text NOT NULL,
  weekly_target numeric(12,2),
  monthly_target numeric(12,2),
  deposit numeric(12,2) DEFAULT 0,
  driver_experience text,
  requirements text,
  availability text DEFAULT 'available',
  insurance_type text DEFAULT 'third_party' CHECK (insurance_type IN ('third_party','comprehensive','none')),
  insurance_expiry date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_vehicles_location ON public.vehicles(location);
CREATE INDEX IF NOT EXISTS idx_vehicles_owner ON public.vehicles(owner_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON public.vehicles(status);

DROP POLICY IF EXISTS "vehicles_read_all" ON public.vehicles;
CREATE POLICY "vehicles_read_all" ON public.vehicles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "vehicles_insert_owner" ON public.vehicles;
CREATE POLICY "vehicles_insert_owner" ON public.vehicles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "vehicles_update_owner" ON public.vehicles;
CREATE POLICY "vehicles_update_owner" ON public.vehicles
  FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "vehicles_delete_owner" ON public.vehicles;
CREATE POLICY "vehicles_delete_owner" ON public.vehicles
  FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- ---------- vehicle_photos ----------
CREATE TABLE IF NOT EXISTS public.vehicle_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vehicle_photos ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_vehicle_photos_vehicle ON public.vehicle_photos(vehicle_id);

DROP POLICY IF EXISTS "vehicle_photos_read_all" ON public.vehicle_photos;
CREATE POLICY "vehicle_photos_read_all" ON public.vehicle_photos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "vehicle_photos_insert_owner" ON public.vehicle_photos;
CREATE POLICY "vehicle_photos_insert_owner" ON public.vehicle_photos
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = vehicle_id AND v.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "vehicle_photos_delete_owner" ON public.vehicle_photos;
CREATE POLICY "vehicle_photos_delete_owner" ON public.vehicle_photos
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = vehicle_id AND v.owner_id = auth.uid())
  );

-- ---------- vehicle_issues ----------
CREATE TABLE IF NOT EXISTS public.vehicle_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'minor' CHECK (severity IN ('minor','moderate','major')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vehicle_issues ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_vehicle_issues_vehicle ON public.vehicle_issues(vehicle_id);

DROP POLICY IF EXISTS "vehicle_issues_read_all" ON public.vehicle_issues;
CREATE POLICY "vehicle_issues_read_all" ON public.vehicle_issues
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "vehicle_issues_insert_owner" ON public.vehicle_issues;
CREATE POLICY "vehicle_issues_insert_owner" ON public.vehicle_issues
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = vehicle_id AND v.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "vehicle_issues_delete_owner" ON public.vehicle_issues;
CREATE POLICY "vehicle_issues_delete_owner" ON public.vehicle_issues
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = vehicle_id AND v.owner_id = auth.uid())
  );

-- ---------- documents ----------
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('national_id','driving_licence','psv_badge','good_conduct','logbook','business','platform_history','profile_photo','vehicle_photo')),
  file_url text NOT NULL,
  label text,
  expiry_date date,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_documents_user ON public.documents(user_id);

DROP POLICY IF EXISTS "documents_read_own_or_admin" ON public.documents;
CREATE POLICY "documents_read_own_or_admin" ON public.documents
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "documents_insert_own" ON public.documents;
CREATE POLICY "documents_insert_own" ON public.documents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "documents_update_own" ON public.documents;
CREATE POLICY "documents_update_own" ON public.documents
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "documents_delete_own" ON public.documents;
CREATE POLICY "documents_delete_own" ON public.documents
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ---------- driver_platform_history ----------
CREATE TABLE IF NOT EXISTS public.driver_platform_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('uber','bolt','little','faras','other')),
  months_active int NOT NULL DEFAULT 0,
  trips int NOT NULL DEFAULT 0,
  rating numeric(2,1),
  proof_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.driver_platform_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dph_driver ON public.driver_platform_history(driver_id);

DROP POLICY IF EXISTS "dph_read_all" ON public.driver_platform_history;
CREATE POLICY "dph_read_all" ON public.driver_platform_history
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "dph_insert_own" ON public.driver_platform_history;
CREATE POLICY "dph_insert_own" ON public.driver_platform_history
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = driver_id);

DROP POLICY IF EXISTS "dph_update_own" ON public.driver_platform_history;
CREATE POLICY "dph_update_own" ON public.driver_platform_history
  FOR UPDATE TO authenticated USING (auth.uid() = driver_id) WITH CHECK (auth.uid() = driver_id);

DROP POLICY IF EXISTS "dph_delete_own" ON public.driver_platform_history;
CREATE POLICY "dph_delete_own" ON public.driver_platform_history
  FOR DELETE TO authenticated USING (auth.uid() = driver_id);

-- ---------- applications ----------
CREATE TABLE IF NOT EXISTS public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','withdrawn','completed')),
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_app_vehicle ON public.applications(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_app_driver ON public.applications(driver_id);
CREATE INDEX IF NOT EXISTS idx_app_owner ON public.applications(owner_id);
CREATE INDEX IF NOT EXISTS idx_app_status ON public.applications(status);

DROP POLICY IF EXISTS "app_read_parties" ON public.applications;
CREATE POLICY "app_read_parties" ON public.applications
  FOR SELECT TO authenticated USING (auth.uid() = driver_id OR auth.uid() = owner_id OR public.is_admin());

DROP POLICY IF EXISTS "app_insert_driver" ON public.applications;
CREATE POLICY "app_insert_driver" ON public.applications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = driver_id);

DROP POLICY IF EXISTS "app_update_owner_driver" ON public.applications;
CREATE POLICY "app_update_owner_driver" ON public.applications
  FOR UPDATE TO authenticated
  USING (auth.uid() = driver_id OR auth.uid() = owner_id OR public.is_admin())
  WITH CHECK (auth.uid() = driver_id OR auth.uid() = owner_id OR public.is_admin());

DROP POLICY IF EXISTS "app_delete_parties" ON public.applications;
CREATE POLICY "app_delete_parties" ON public.applications
  FOR DELETE TO authenticated USING (auth.uid() = driver_id OR auth.uid() = owner_id);

-- ---------- conversations ----------
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid UNIQUE REFERENCES public.applications(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_conv_driver ON public.conversations(driver_id);
CREATE INDEX IF NOT EXISTS idx_conv_owner ON public.conversations(owner_id);

DROP POLICY IF EXISTS "conv_read_parties" ON public.conversations;
CREATE POLICY "conv_read_parties" ON public.conversations
  FOR SELECT TO authenticated USING (auth.uid() = driver_id OR auth.uid() = owner_id OR public.is_admin());

DROP POLICY IF EXISTS "conv_insert_parties" ON public.conversations;
CREATE POLICY "conv_insert_parties" ON public.conversations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = driver_id OR auth.uid() = owner_id);

-- ---------- messages ----------
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text,
  type text NOT NULL DEFAULT 'text' CHECK (type IN ('text','image','file','system')),
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_msg_conv ON public.messages(conversation_id, created_at);

DROP POLICY IF EXISTS "msg_read_parties" ON public.messages;
CREATE POLICY "msg_read_parties" ON public.messages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (c.driver_id = auth.uid() OR c.owner_id = auth.uid())
    ) OR public.is_admin()
  );

DROP POLICY IF EXISTS "msg_insert_parties" ON public.messages;
CREATE POLICY "msg_insert_parties" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (c.driver_id = auth.uid() OR c.owner_id = auth.uid())
    ) AND auth.uid() = sender_id
  );

DROP POLICY IF EXISTS "msg_update_read_flag" ON public.messages;
CREATE POLICY "msg_update_read_flag" ON public.messages
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (c.driver_id = auth.uid() OR c.owner_id = auth.uid())
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (c.driver_id = auth.uid() OR c.owner_id = auth.uid())
    )
  );

-- ---------- reviews ----------
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON public.reviews(reviewee_id);

DROP POLICY IF EXISTS "reviews_read_all" ON public.reviews;
CREATE POLICY "reviews_read_all" ON public.reviews
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "reviews_insert_reviewer" ON public.reviews;
CREATE POLICY "reviews_insert_reviewer" ON public.reviews
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = reviewer_id
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id
      AND a.status = 'accepted'
      AND (a.driver_id = auth.uid() OR a.owner_id = auth.uid())
    )
  );

-- ---------- notifications ----------
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  data jsonb,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_notif_user ON public.notifications(user_id, created_at);

DROP POLICY IF EXISTS "notif_read_own" ON public.notifications;
CREATE POLICY "notif_read_own" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_insert_own" ON public.notifications;
CREATE POLICY "notif_insert_own" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_update_own" ON public.notifications;
CREATE POLICY "notif_update_own" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_delete_own" ON public.notifications;
CREATE POLICY "notif_delete_own" ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ---------- reports ----------
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('user','listing','conversation','review')),
  target_id uuid,
  reason text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_read_own_or_admin" ON public.reports;
CREATE POLICY "reports_read_own_or_admin" ON public.reports
  FOR SELECT TO authenticated USING (auth.uid() = reporter_id OR public.is_admin());

DROP POLICY IF EXISTS "reports_insert_own" ON public.reports;
CREATE POLICY "reports_insert_own" ON public.reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "reports_update_admin" ON public.reports;
CREATE POLICY "reports_update_admin" ON public.reports
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------- blocks ----------
CREATE TABLE IF NOT EXISTS public.blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocks_read_own" ON public.blocks;
CREATE POLICY "blocks_read_own" ON public.blocks
  FOR SELECT TO authenticated USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "blocks_insert_own" ON public.blocks;
CREATE POLICY "blocks_insert_own" ON public.blocks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "blocks_delete_own" ON public.blocks;
CREATE POLICY "blocks_delete_own" ON public.blocks
  FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

-- ---------- favorites ----------
CREATE TABLE IF NOT EXISTS public.favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, vehicle_id)
);
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fav_user ON public.favorites(user_id);

DROP POLICY IF EXISTS "fav_read_own" ON public.favorites;
CREATE POLICY "fav_read_own" ON public.favorites
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "fav_insert_own" ON public.favorites;
CREATE POLICY "fav_insert_own" ON public.favorites
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "fav_delete_own" ON public.favorites;
CREATE POLICY "fav_delete_own" ON public.favorites
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ---------- storage buckets ----------
INSERT INTO storage.buckets (id, name, public)
VALUES ('vehicle-photos', 'vehicle-photos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "vehicle_photos_public_read" ON storage.objects;
CREATE POLICY "vehicle_photos_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'vehicle-photos');

DROP POLICY IF EXISTS "vehicle_photos_upload" ON storage.objects;
CREATE POLICY "vehicle_photos_upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'vehicle-photos');

DROP POLICY IF EXISTS "vehicle_photos_update" ON storage.objects;
CREATE POLICY "vehicle_photos_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'vehicle-photos' AND owner = auth.uid());

DROP POLICY IF EXISTS "vehicle_photos_delete" ON storage.objects;
CREATE POLICY "vehicle_photos_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'vehicle-photos' AND owner = auth.uid());

DROP POLICY IF EXISTS "documents_read_own" ON storage.objects;
CREATE POLICY "documents_read_own" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'documents' AND owner = auth.uid());

DROP POLICY IF EXISTS "documents_upload" ON storage.objects;
CREATE POLICY "documents_upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documents');

DROP POLICY IF EXISTS "documents_delete_own" ON storage.objects;
CREATE POLICY "documents_delete_own" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'documents' AND owner = auth.uid());

-- ---------- updated_at trigger ----------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_vehicles_updated ON public.vehicles;
CREATE TRIGGER trg_vehicles_updated BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_applications_updated ON public.applications;
CREATE TRIGGER trg_applications_updated BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
