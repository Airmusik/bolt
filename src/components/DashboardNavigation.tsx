import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Car, ClipboardList, LayoutDashboard, Link2, MessageSquare, Users } from 'lucide-react';
import { activeDashboardTab, dashboardDestination, getDashboardTabs, type DashboardTab, type MemberRole } from '@/lib/dashboardNavigation';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const icons = { overview: LayoutDashboard, drivers: Users, vehicles: Car, cars: Car, applications: ClipboardList, connections: Link2, chats: MessageSquare } satisfies Record<DashboardTab, typeof Car>;

export function DashboardNavigation({ role, userId }: { role: MemberRole; userId: string }) {
  const location = useLocation();
  const [pending, setPending] = useState(0);
  const activeTab = activeDashboardTab(role, location.pathname, location.search);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      const { count, error } = await supabase.from('connections').select('id', { count: 'exact', head: true }).eq('recipient_id', userId).eq('status', 'pending');
      if (!disposed && !error) setPending(count ?? 0);
    };
    void load();
    const channel = supabase.channel(`member-navigation-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections', filter: `recipient_id=eq.${userId}` }, () => { void load(); })
      .subscribe();
    window.addEventListener('focus', load);
    return () => {
      disposed = true;
      window.removeEventListener('focus', load);
      void supabase.removeChannel(channel);
    };
  }, [userId, location.key]);

  return (
    <nav aria-label="Dashboard sections" className="sticky top-16 z-40 shrink-0 bg-white/95 py-1.5 backdrop-blur-xl dark:bg-[#0b0b0d]/95 ">
      <div className="container-content">
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-ink-50 p-2 ring-1 ring-ink-100 dark:bg-[#101012] sm:flex sm:overflow-x-auto">
          {getDashboardTabs(role).map((tab) => {
            const Icon = icons[tab.id];
            return (
              <Link key={tab.id} to={dashboardDestination(tab.id)} onClick={(event) => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) window.scrollTo(0, 0); }} aria-label={tab.label} aria-current={activeTab === tab.id ? 'page' : undefined} className={cn('member-nav-button relative flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1.5 text-xs font-semibold leading-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:shrink-0 sm:flex-row sm:gap-1.5 sm:whitespace-nowrap sm:flex-1 sm:px-4 sm:text-sm sm:leading-5', activeTab === tab.id ? 'member-nav-active text-white shadow-soft' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200')}>
                <Icon className="member-nav-icon h-5 w-5 shrink-0" />
                <span className="max-w-full truncate sm:hidden">{tab.shortLabel}</span><span className="hidden sm:inline">{tab.label}</span>
                {tab.id === 'connections' && pending > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-bold text-white sm:static">{pending > 99 ? '99+' : pending}</span>}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
