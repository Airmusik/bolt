import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/useAuth';
import { supabase } from '@/lib/supabase';

const preferenceKey = '11drive-analytics-choice';
export function AnalyticsPreference() {
  return <button className="underline" onClick={() => { try { localStorage.removeItem(preferenceKey); } catch { /* storage may be blocked */ } window.dispatchEvent(new Event('analytics-preference')); }}>Change analytics preference</button>;
}

export function SiteAnalyticsTracker() {
  const { profile, loading, user } = useAuth();
  const location = useLocation();
  const [choice, setChoice] = useState(() => { try { return localStorage.getItem(preferenceKey); } catch { return 'no'; } });
  const excluded = loading || profile?.role === 'admin' || (user && !profile) || location.pathname.startsWith('/admin');
  useEffect(() => {
    const reset = () => setChoice(null);
    window.addEventListener('analytics-preference', reset);
    return () => window.removeEventListener('analytics-preference', reset);
  }, []);
  useEffect(() => {
    if (excluded || choice !== 'yes' || navigator.doNotTrack === '1') return;
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
  if (excluded || choice || navigator.doNotTrack === '1') return null;
  const select = (value: string) => { try { localStorage.setItem(preferenceKey, value); } catch { /* preference still works for this page */ } setChoice(value); };
  return <aside className="fixed bottom-3 left-3 right-3 z-50 mx-auto max-w-xl rounded-2xl border border-ink-200 bg-white p-4 text-sm text-ink-800 shadow-xl dark:bg-ink-100" aria-label="Optional analytics">
    <p>Help improve 11Drive? Allow visit measurements and approximate country, plus signed-in activity counts. No precise location, IP address, or message content is stored in analytics. <a className="underline" href="/privacy">Privacy details</a></p>
    <div className="mt-3 flex gap-3"><button className="btn-secondary flex-1" onClick={() => select('no')}>No thanks</button><button className="btn-primary flex-1" onClick={() => select('yes')}>Allow analytics</button></div>
  </aside>;
}
