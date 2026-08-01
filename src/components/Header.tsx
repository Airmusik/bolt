import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Car, Menu, X, Bell, User, LogOut, LayoutDashboard, Heart, Settings, LifeBuoy, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Avatar } from './Avatar';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

export function Header() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false);
      if (active) setUnread(count ?? 0);
    };
    load();
    const channel = supabase
      .channel('notif-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const isAdmin = profile?.role === 'admin';
  const isOwner = profile?.role === 'owner';
  const isDriver = profile?.role === 'driver';

  const navLinks = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: !!user && !isAdmin },
    { to: '/browse-cars', label: 'Browse Cars', show: !isOwner },
    { to: '/browse-drivers', label: 'Browse Drivers', show: !isDriver },
    { to: '/how-it-works', label: 'How it works', show: true },
  ].filter((l) => l.show) as { to: string; label: string; icon?: any }[];

  return (
    <header className="sticky top-0 z-50 border-b border-ink-100 bg-white/90 backdrop-blur-md">
      <div className="container-content flex h-16 items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Car className="h-5 w-5" />
          </span>
          <span className="font-display text-lg font-extrabold tracking-tight text-ink-900">
            Gari<span className="text-brand-600">Link</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                location.pathname === l.to || (l.to !== '/' && location.pathname.startsWith(l.to))
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
              )}
            >
              {l.icon && <l.icon className="h-4 w-4" />}
              {l.label}
            </Link>
          ))}
          <Link
            to={isAdmin ? '/admin' : '/admin/login'}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors',
              location.pathname.startsWith('/admin') ? 'bg-brand-50 text-brand-700' : 'text-brand-600 hover:bg-brand-50 hover:text-brand-700'
            )}
          >
            <ShieldCheck className="h-4 w-4" /> Admin
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link
                to="/notifications"
                className="relative rounded-full p-2 text-ink-600 hover:bg-ink-100"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </Link>

              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-ink-100"
                >
                  <Avatar name={profile?.full_name || 'User'} src={profile?.avatar_url} size={32} verified={profile?.is_verified} />
                  <span className="hidden text-sm font-medium text-ink-800 sm:block">
                    {profile?.full_name?.split(' ')[0]}
                  </span>
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-12 z-20 w-56 animate-scale-in overflow-hidden rounded-xl bg-white py-1 shadow-card-hover ring-1 ring-ink-200">
                      <div className="border-b border-ink-100 px-4 py-3">
                        <p className="truncate text-sm font-semibold text-ink-900">{profile?.full_name}</p>
                        <p className="text-xs capitalize text-ink-500">{profile?.role}</p>
                      </div>
                      <MenuItem to="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />}>Dashboard</MenuItem>
                      <MenuItem to="/saved" icon={<Heart className="h-4 w-4" />}>Saved listings</MenuItem>
                      <MenuItem to="/settings" icon={<Settings className="h-4 w-4" />}>Settings</MenuItem>
                      {profile?.role === 'admin' && (
                        <MenuItem to="/admin" icon={<ShieldCheck className="h-4 w-4" />}>Admin</MenuItem>
                      )}
                      <MenuItem to="/help" icon={<LifeBuoy className="h-4 w-4" />}>Help center</MenuItem>
                      <button
                        onClick={async () => { await signOut(); navigate('/'); }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-danger hover:bg-red-50"
                      >
                        <LogOut className="h-4 w-4" /> Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link to="/login" className="btn-ghost">Sign in</Link>
              <Link to="/register" className="btn-primary">Get started</Link>
            </div>
          )}

          <button
            className="rounded-full p-2 text-ink-700 hover:bg-ink-100 md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Menu"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-ink-100 bg-white md:hidden">
          <div className="container-content flex flex-col py-3">
            {navLinks.map((l) => (
              <Link key={l.to} to={l.to} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-100">
                {l.icon && <l.icon className="h-4 w-4" />}
                {l.label}
              </Link>
            ))}
            {!user && (
              <div className="mt-2 flex gap-2 border-t border-ink-100 pt-3">
                <Link to="/login" className="btn-secondary flex-1">Sign in</Link>
                <Link to="/register" className="btn-primary flex-1">Get started</Link>
              </div>
            )}
            <Link to={isAdmin ? '/admin' : '/admin/login'} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-brand-600 hover:bg-brand-50">
              <ShieldCheck className="h-4 w-4" /> Admin
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

function MenuItem({ to, icon, children }: { to: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-2.5 text-sm text-ink-700 hover:bg-ink-100">
      {icon}
      {children}
    </Link>
  );
}
