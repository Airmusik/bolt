import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/useAuth';
import { supabase } from '@/lib/supabase';

const preferenceKey = '11drive-analytics-choice';
function readChoice() { try { return localStorage.getItem(preferenceKey); } catch { return 'no'; } }
export function AnalyticsPreference() {
  const [disabled, setDisabled] = useState(() => readChoice() === 'no');
  return <button className="underline" aria-pressed={disabled} onClick={() => { const next = !disabled; try { localStorage.setItem(preferenceKey, next ? 'no' : 'yes'); } catch { return; } setDisabled(next); window.dispatchEvent(new Event('analytics-preference')); }}>{disabled ? 'Analytics disabled — enable analytics' : 'Turn off site analytics on this browser'}</button>;
}

export function SiteAnalyticsTracker() {
  const { profile, loading, user } = useAuth();
  const location = useLocation();
  const [choice, setChoice] = useState(readChoice);
  const excluded = loading || profile?.role === 'admin' || (user && !profile) || location.pathname.startsWith('/admin');
  useEffect(() => {
    const reset = () => setChoice(readChoice());
    window.addEventListener('analytics-preference', reset);
    return () => window.removeEventListener('analytics-preference', reset);
  }, []);
  useEffect(() => {
    if (excluded || choice === 'no' || navigator.doNotTrack === '1') return;
    // No IDs, queries, search terms, or chat content in page names.
    const segments = location.pathname.split('/').filter(Boolean);
    const known = ['dashboard', 'browse-cars', 'browse-drivers', 'vehicles', 'drivers', 'members', 'login', 'register', 'chat', 'settings', 'promotions', 'saved', 'notifications', 'about', 'contact', 'help', 'privacy', 'terms', 'how-it-works', 'onboarding'];
    const path = !segments.length ? '/' : known.includes(segments[0]) ? `/${segments[0]}${segments.length > 1 ? '/detail' : ''}` : '/other';
    let session: string;
    try { session = sessionStorage.getItem('11drive-visit') || crypto.randomUUID(); sessionStorage.setItem('11drive-visit', session); } catch { return; }
    let cancelled = false;
    const send = async (view: boolean) => {
      if (document.visibilityState !== 'visible') return;
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      await fetch('/api/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) }, body: JSON.stringify({ session, path, view }) }).catch(() => {});
    };
    const initial = window.setTimeout(() => void send(true), 350);
    const heartbeat = window.setInterval(() => void send(false), 60000);
    return () => { cancelled = true; clearTimeout(initial); clearInterval(heartbeat); };
  }, [excluded, choice, location.pathname, user?.id]);
  return null;
}
