/** Profile columns that are safe to expose to other authenticated members. */
export const PUBLIC_PROFILE_FIELDS = 'id,role,full_name,avatar_url,bio,location,preferred_locations,availability,languages,age,driving_experience_years,platforms_worked,licence_expiry,psv_badge_expiry,good_conduct_expiry,is_verified,verification_status,is_suspended,rating,rating_count,onboarding_completed,last_seen_at,created_at,updated_at' as const;

/** Smaller public browsing projection. It intentionally excludes email, phone, document dates, and presence. */
export const BROWSE_PROFILE_FIELDS = 'id,role,full_name,avatar_url,bio,location,preferred_locations,availability,languages,age,driving_experience_years,platforms_worked,is_verified,verification_status,is_suspended,rating,rating_count,onboarding_completed,created_at,updated_at' as const;
