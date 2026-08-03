import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Notification } from '@/lib/types';
import { EmptyState } from '@/components/EmptyState';
import { timeAgo, cn } from '@/lib/utils';
import { BackButton } from '@/components/BackButton';

export function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    setNotifications((data as Notification[]) || []);
    setLoading(false);
  };

  // Auto-mark all unread notifications as read when the page opens
  useEffect(() => {
    if (!user) return;
    (async () => {
      await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
      load();
    })();
  }, [user]);

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    load();
  };
  const remove = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications((n) => n.filter((x) => x.id !== id));
  };

  return (
    <div className="container-content py-8">
      <BackButton to="/dashboard" />
      <div className="mt-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink-900">Notifications</h1>
        {notifications.some((n) => !n.read) && <button onClick={markAllRead} className="btn-secondary text-sm"><Check className="h-4 w-4" /> Mark all read</button>}
      </div>

      <div className="mt-6 space-y-2">
        {loading ? <div className="card h-32 animate-pulse" /> : notifications.length === 0 ? (
          <EmptyState title="No notifications" description="You'll see updates here when drivers apply, messages arrive, or your verification status changes." />
        ) : (
          notifications.map((n) => (
            <div key={n.id} className={cn('card flex items-start gap-3 p-4', !n.read && 'ring-brand-200')}>
              <div className={cn('mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', n.read ? 'bg-ink-100 text-ink-400' : 'bg-brand-100 text-brand-700')}>
                <Bell className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink-900">{n.title}</p>
                {n.body && <p className="text-sm text-ink-600">{n.body}</p>}
                <p className="mt-1 text-xs text-ink-400">{timeAgo(n.created_at)}</p>
              </div>
              <button onClick={() => remove(n.id)} className="text-ink-300 hover:text-danger"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
