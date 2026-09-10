import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/useAuth';
import { supabase } from '@/lib/supabase';
import { useSiteSettings } from '@/lib/siteSettings';
import { supportInboxPath } from '@/lib/supportInbox';
import { timeAgo } from '@/lib/utils';
import { SiteLogo } from './SiteLogo';

export function SupportInboxEntry({ search, selected = false }: { search: string; selected?: boolean }) {
  const { user } = useAuth();
  const { settings } = useSiteSettings();
  const userId = user?.id;
  const [latest, setLatest] = useState<{ id: string; updated_at: string; message: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase.from('contact_messages').select('id,updated_at,message').eq('user_id', userId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    setFailed(!!error);
    if (!error) setLatest(data);
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    void load();
    const channel = supabase.channel(`support-inbox-entry:${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'contact_messages', filter: `user_id=eq.${userId}` }, () => void load()).subscribe();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30000);
    return () => { void supabase.removeChannel(channel); window.clearInterval(timer); };
  }, [userId, load]);
  if (search && !`support help ${settings.site_name} ${latest?.message || ''}`.toLowerCase().includes(search.toLowerCase())) return null;
  return <Link to={supportInboxPath(latest ? new URLSearchParams({ message: latest.id }) : '')} aria-current={selected ? 'page' : undefined} className={`mx-2 mt-2 flex items-center gap-3 rounded-xl border border-ink-100 p-3 text-left hover:bg-ink-50 ${selected ? 'bg-ink-50 ring-1 ring-brand-200' : ''}`}>
    <SiteLogo size={46} />
    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink-900">Official {settings.site_name} Support</p><p className="mt-1 truncate text-xs text-ink-500">{failed ? 'Open your support messages' : latest?.message || 'Contact support — replies stay here'}</p>{latest?.updated_at && <p className="mt-1 text-[10px] text-ink-400">{timeAgo(latest.updated_at)}</p>}</div>
  </Link>;
}
