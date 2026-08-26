import type { Profile } from './types';

export const DEMO_MODE = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === 'true';
export const DEMO_ADMIN_EMAIL = import.meta.env.VITE_DEMO_ADMIN_EMAIL || '';
export const DEMO_ADMIN_PASSWORD = import.meta.env.VITE_DEMO_ADMIN_PASSWORD || '';
export const DEMO_ADMIN_SESSION_KEY = 'garilink_demo_admin_session';
export const DEMO_ADMIN_ID = '00000000-0000-4000-8000-000000000001';

export function createDemoAdminProfile(): Profile {
  const now = new Date().toISOString();
  return {
    id: DEMO_ADMIN_ID,
    email: DEMO_ADMIN_EMAIL,
    role: 'admin',
    full_name: 'Platform Admin',
    phone: null,
    avatar_url: null,
    avatar_pending_url: null,
    avatar_upload_status: 'none',
    avatar_rejection_reason: null,
    bio: 'Local preview administrator',
    location: 'Kenya',
    preferred_locations: [],
    availability: 'available',
    languages: [],
    age: null,
    driving_experience_years: 1,
    platforms_worked: [],
    id_number: null,
    licence_number: null,
    licence_expiry: null,
    psv_badge_expiry: null,
    good_conduct_expiry: null,
    is_verified: true,
    verification_status: 'approved',
    is_suspended: false,
    suspension_reason: null,
    suspended_at: null,
    rating: 5,
    rating_count: 0,
    contracts_completed: 0,
    onboarding_completed: true,
    created_at: now,
    updated_at: now,
  };
}
