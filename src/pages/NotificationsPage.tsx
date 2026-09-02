import { useCallback, useEffect, useState } from 'react';
import { Bell, Check, Trash2, Eye, Clock3 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import type { Notification } from '@/lib/types';
import { EmptyState } from '@/components/EmptyState';
import { timeAgo, cn } from '@/lib/utils';
import { BackButton } from '@/components/BackButton';
import { useToast } from '@/components/useToast';
import { Modal } from '@/components/Modal';
import { notifyUnreadCountChanged } from '@/lib/notificationEvents';
import { useNavigate } from 'react-router-dom';

function notificationDestination(notification: Notification): string | null {
  const data = notification.data || {};
  const explicitPath = typeof data.path === 'string' ? data.path : typeof data.url === 'string' ? data.url : null;
  if (explicitPath?.startsWith('/') && !explicitPath.startsWith('//')) return explicitPath;

  const conversationId = typeof data.conversation_id === 'string' ? data.conversation_id : null;
  if (conversationId) return `/chat/${conversationId}`;
  if (notification.type === 'message') return '/chat';
  if (notification.type.startsWith('connection_')) return '/dashboard?tab=connections';
  if (notification.type.startsWith('application_')) return '/dashboard?tab=applications';
  if (notification.type.includes('verification') || notification.type.includes('trust')) return '/onboarding';
  if (notification.type.includes('vehicle') || notification.type.includes('listing')) {
    const vehicleId = typeof data.vehicle_id === 'string' ? data.vehicle_id : null;
    return vehicleId ? `/vehicles/${vehicleId}` : '/dashboard?tab=vehicles';
  }
  if (notification.type === 'warning' || notification.type.includes('report')) return '/settings';
  return null;
}

export function NotificationsPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Notification | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (error) {
      setLoading(false);
      toast('Could not load notifications: ' + error.message, 'error');
      return;
    }
    setNotifications((data as Notification[]) || []);
    setLoading(false);
  }, [user, toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`notifications-page-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, load]);

  const markRead = async (notification: Notification) => {
    if (notification.read) return notification;
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', notification.id);
    if (error) { toast('Could not mark this notification as read.', 'error'); return null; }
    const updated = { ...notification, read: true };
    setNotifications((items) => items.map((item) => item.id === notification.id ? updated : item));
    notifyUnreadCountChanged();
    return updated;
  };

  const openNotification = async (notification: Notification) => {
    const updated = await markRead(notification);
    if (!updated) return;
    const destination = notificationDestination(updated);
    if (destination) {
      navigate(destination);
      return;
    }
    setSelected(updated);
  };

  const readFullMessage = async (notification: Notification) => {
    const updated = await markRead(notification);
    if (updated) setSelected(updated);
  };

  const markAllRead = async () => {
    if (!user) return;
    const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    if (error) { toast('Could not mark notifications as read.', 'error'); return; }
    await load();
    notifyUnreadCountChanged();
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from('notifications').delete().eq('id', id);
    if (error) { toast('Could not delete notification.', 'error'); return; }
    setNotifications((n) => n.filter((x) => x.id !== id));
    notifyUnreadCountChanged();
    toast('Notification deleted.');
  };

  return (
    <div className="container-content py-8">
      <BackButton to={profile?.role === 'admin' ? '/admin' : '/dashboard'} />
      <div className="mt-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink-900">Notifications</h1>
        {notifications.some((n) => !n.read) && <button onClick={markAllRead} className="btn-secondary text-sm"><Check className="h-4 w-4" /> Mark all read</button>}
      </div>

      <div className="mt-6 space-y-2">
        {loading ? <div className="card h-32 animate-pulse" /> : notifications.length === 0 ? (
          <EmptyState title="No notifications" description="You'll see updates here when drivers apply, messages arrive, or your platform-history review changes." />
        ) : (
          notifications.map((n) => (
            <div key={n.id} className={cn('card flex items-start gap-3 overflow-hidden p-2 transition hover:-translate-y-0.5 hover:shadow-card-hover', !n.read && 'ring-brand-200')}>
              <div className={cn('mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', n.read ? 'bg-ink-100 text-ink-400' : 'bg-brand-100 text-brand-700')}>
                <Bell className="h-4 w-4" />
              </div>
              <button type="button" onClick={() => openNotification(n)} className="min-w-0 flex-1 px-1 py-1 text-left" aria-label={`Open notification: ${n.title}`}>
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-ink-900">{n.title}</p>
                  {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
                </div>
                {n.body && <p className="mt-0.5 line-clamp-2 text-sm text-ink-600">{n.body}</p>}
                <p className="mt-1 flex items-center gap-1 text-xs text-ink-400"><Eye className="h-3 w-3" /> {notificationDestination(n) ? 'Open related page' : 'Open full message'} · {timeAgo(n.created_at)}</p>
              </button>
              <button onClick={() => readFullMessage(n)} className="rounded-full p-2 text-ink-400 hover:bg-brand-50 hover:text-brand-700" aria-label={`Read full notification: ${n.title}`} title="Read full message"><Eye className="h-4 w-4" /></button>
              <button onClick={() => remove(n.id)} className="rounded-full p-2 text-ink-300 hover:bg-red-50 hover:text-danger" aria-label="Delete notification"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))
        )}
      </div>

      {selected && (
        <Modal title={selected.title} onClose={() => setSelected(null)}>
          <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-white p-4 ring-1 ring-brand-100 dark:from-brand-950/30 dark:to-[#141416] dark:ring-brand-900">
            <div className="mb-4 flex items-center gap-2 text-xs text-ink-500">
              <Clock3 className="h-4 w-4" />
              {new Date(selected.created_at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}
              <span className="rounded-full bg-white px-2 py-0.5 font-medium capitalize text-brand-700 ring-1 ring-brand-100 dark:bg-[#1d1d20]">{selected.type.replace(/_/g, ' ')}</span>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink-700">{selected.body || 'There are no additional details for this notification.'}</p>
            {typeof selected.data?.reason === 'string' && (
              <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-100 dark:bg-amber-950/20 dark:text-amber-200">
                <span className="font-semibold">Related report:</span> {selected.data.reason}
              </div>
            )}
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => setSelected(null)} className="btn-secondary w-full">Done</button>
            {notificationDestination(selected) && <button type="button" onClick={() => { const destination = notificationDestination(selected); setSelected(null); if (destination) navigate(destination); }} className="btn-primary w-full">Open related page</button>}
          </div>
        </Modal>
      )}
    </div>
  );
}
