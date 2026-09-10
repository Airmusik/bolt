import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Check, Clock3, Mail, Megaphone } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { useSiteSettings } from '@/lib/siteSettings';
import type { Notification } from '@/lib/types';
import { BackButton } from '@/components/BackButton';
import { EmptyState } from '@/components/EmptyState';
import { SiteLogo } from '@/components/SiteLogo';
import { useToast } from '@/components/useToast';
import { notifyUnreadCountChanged } from '@/lib/notificationEvents';
import { updateFromSearch } from '@/lib/memberUpdates';

export function UpdatesPage() {
  const { user, profile } = useAuth();
  const { settings } = useSiteSettings();
  const { toast } = useToast();
  const [updates, setUpdates] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const { search } = useLocation();
  const selectedUpdate = updateFromSearch(search);
  const focusedUpdate = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedUpdate || focusedUpdate.current === selectedUpdate) return;
    const article = document.getElementById(`update-${selectedUpdate}`);
    if (!article) return;
    focusedUpdate.current = selectedUpdate;
    article.focus({ preventScroll: true });
    article.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [selectedUpdate, updates]);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.from('notifications').select('*').eq('user_id', user.id).eq('type', 'admin_announcement').order('created_at', { ascending: false });
    if (error) toast(`Could not load updates: ${error.message}`, 'error');
    else setUpdates((data as Notification[]) || []);
    setLoading(false);
  }, [user, toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`member-updates-${user.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => void load()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, load]);

  const markRead = async (id: string) => {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id).eq('user_id', user!.id);
    if (error) { toast('Could not mark this update as read.', 'error'); return; }
    setUpdates(items => items.map(item => item.id === id ? { ...item, read: true } : item));
    notifyUnreadCountChanged();
  };
  const markAllRead = async () => {
    if (!user) return;
    const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('type', 'admin_announcement').eq('read', false);
    if (error) { toast('Could not mark updates as read.', 'error'); return; }
    setUpdates(items => items.map(item => ({ ...item, read: true })));
    notifyUnreadCountChanged();
  };

  return <div className="container-content py-8">
    <BackButton to={profile?.role === 'admin' ? '/admin' : '/dashboard'} />
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-50 text-accent-600 ring-1 ring-accent-200"><Megaphone className="h-5 w-5" /></span><div><h1 className="font-display text-2xl font-bold text-ink-900">{settings.site_name} Updates</h1><p className="text-sm text-ink-500">Official news and service announcements.</p></div></div>
      {updates.some(update => !update.read) && <button className="btn-secondary text-sm" onClick={markAllRead}><Check className="h-4 w-4" /> Mark all read</button>}
    </div>

    <div className="mx-auto mt-6 max-w-3xl space-y-5">
      {loading ? <div className="card h-56 animate-pulse" /> : updates.length === 0 ? <EmptyState title="No updates yet" description={`Official ${settings.site_name} announcements will appear here in full.`} /> : updates.map(update => <article key={update.id} id={`update-${update.id}`} tabIndex={-1} className={`scroll-mt-44 overflow-hidden rounded-2xl border bg-white shadow-card focus:outline-none focus:ring-2 focus:ring-accent-500 dark:bg-[#141416] ${update.read ? 'border-ink-200' : 'border-accent-300 ring-2 ring-accent-100'}`}>
        <div className="h-1.5 bg-accent-500" />
        <div className="border-b border-ink-100 bg-ink-50/70 px-5 py-4 sm:px-7">
          <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-ink-200"><SiteLogo /></span><div className="min-w-0 flex-1"><p className="font-bold text-ink-900">Official {settings.site_name}</p><p className="flex items-center gap-1.5 text-xs text-ink-500"><Mail className="h-3.5 w-3.5" /> To: You</p></div>{!update.read && <span className="badge-accent">New</span>}</div>
        </div>
        <div className="px-5 py-6 sm:px-7 sm:py-7">
          <h2 className="text-xl font-bold leading-snug text-ink-900">{update.title}</h2>
          <p className="mt-4 whitespace-pre-wrap break-words text-[15px] leading-7 text-ink-700">{update.body}</p>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4"><p className="flex items-center gap-1.5 text-xs text-ink-400"><Clock3 className="h-3.5 w-3.5" /> {new Date(update.created_at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}</p>{!update.read && <button className="btn-secondary px-3 py-2 text-xs" onClick={() => void markRead(update.id)}><Check className="h-3.5 w-3.5" /> Mark as read</button>}</div>
        </div>
        <div className="bg-ink-50 px-5 py-3 text-center text-xs text-ink-500 sm:px-7">{settings.site_tagline}</div>
      </article>)}
    </div>
  </div>;
}
