import { createClient } from '@supabase/supabase-js';
import { googleCallbackError } from './googleAuth';

// Capture a safe message before Auth consumes/removes the callback fragment.
export const initialGoogleCallbackError = window.location.pathname === '/auth/callback'
  ? googleCallbackError(window.location.search, window.location.hash) : null;

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // Surface a clear error rather than a cryptic failure later.
  console.error('Supabase env vars missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const VEHICLE_BUCKET = 'vehicle-photos';
export const DOCUMENT_BUCKET = 'documents';
export const AVATAR_BUCKET = 'avatars';
export const SITE_ASSETS_BUCKET = 'site-assets';
export const CHAT_MEDIA_BUCKET = 'chat-media';
export const CONTACT_ATTACHMENTS_BUCKET = 'contact-attachments';
