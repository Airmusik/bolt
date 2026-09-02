import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Menu, X, Bell, LogOut, LayoutDashboard, Heart, Settings, LifeBuoy, User } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { Avatar } from './Avatar';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useSiteSettings } from '@/lib/siteSettings';
import { ThemeToggle } from './ThemeToggle';
import { SiteLogo } from './SiteLogo';
import { NOTIFICATIONS_CHANGED_EVENT } from '@/lib/notificationEvents';

type AudioWindow = typeof window & { webkitAudioContext?: typeof AudioContext };
let notificationAudioContext: AudioContext | null = null;

function getNotificationAudioContext() {
  if (notificationAudioContext) return notificationAudioContext;
  const AudioContextClass = window.AudioContext || (window as AudioWindow).webkitAudioContext;
  if (!AudioContextClass) return null;
  notificationAudioContext = new AudioContextClass();
  return notificationAudioContext;
}

function playNotificationTone() {
  try {
    const context = getNotificationAudioContext();
    if (!context) return;
    if (context.state === 'suspended') void context.resume();
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.7);

    const first = context.createOscillator();
    first.type = 'sine';
    first.frequency.value = 784;
    first.connect(gain);
    first.start(context.currentTime);
    first.stop(context.currentTime + 0.24);

    const second = context.createOscillator();
    second.type = 'sine';
    second.frequency.value = 523.25;
    second.connect(gain);
    second.start(context.currentTime + 0.25);
    second.stop(context.currentTime + 0.65);
  } catch {
    // Browsers may prevent sound until the member has interacted with the page.
  }
}

export function Header() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const { settings } = useSiteSettings();

  useEffect(() => {
    let unlocked = false;
    const unlockNotificationSound = () => {
      if (unlocked) return;
      unlocked = true;
      const context = getNotificationAudioContext();
      if (context?.state === 'suspended') void context.resume();
      window.removeEventListener('pointerdown', unlockNotificationSound);
      window.removeEventListener('keydown', unlockNotificationSound);
    };
    window.addEventListener('pointerdown', unlockNotificationSound);
    window.addEventListener('keydown', unlockNotificationSound);
    return () => {
      window.removeEventListener('pointerdown', unlockNotificationSound);
      window.removeEventListener('keydown', unlockNotificationSound);
    };
  }, []);

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
    void load();
    const fallbackPoll = window.setInterval(() => void load(), 20_000);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, load);
    const channel = supabase
      .channel('notif-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
        playNotificationTone();
        load();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, load)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => {
      active = false;
      window.clearInterval(fallbackPoll);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, load);
      supabase.removeChannel(channel);
    };
  }, [user]);

  const isAdmin = profile?.role === 'admin';
  const isSuspended = !!profile?.is_suspended;

  const navLinks = isSuspended
    ? [
        { to: '/about', label: 'About', icon: undefined, show: true },
        { to: '/contact', label: 'Contact', icon: undefined, show: true },
        { to: '/terms', label: 'Terms', icon: undefined, show: true },
        { to: '/privacy', label: 'Privacy', icon: undefined, show: true },
      ]
    : (user
        ? [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: !isAdmin }]
        : [
            { to: '/browse-cars', label: 'Browse Cars', icon: undefined, show: true },
            { to: '/browse-drivers', label: 'Browse Drivers', icon: undefined, show: true },
            { to: '/how-it-works', label: 'How it works', icon: undefined, show: true },
          ]).filter((l) => l.show);

  const mobileAccountLinks = isSuspended
    ? []
    : isAdmin
      ? [
          { to: '/admin', label: 'Admin dashboard', icon: LayoutDashboard },
          { to: '/help', label: 'Help center', icon: LifeBuoy },
        ]
      : [
          { to: '/saved', label: 'Saved listings', icon: Heart },
          { to: '/settings', label: 'Settings', icon: Settings },
          { to: '/help', label: 'Help center', icon: LifeBuoy },
        ];

  return (
    <header className="sticky top-0 z-50 border-b border-ink-100 bg-white/90 backdrop-blur-md dark:bg-[#0b0b0d]/90">
      <div className="container-content flex h-16 items-center justify-between gap-2 sm:gap-4">
        <Link to="/" className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <SiteLogo />
          <span className="site-wordmark truncate font-display text-base font-extrabold tracking-tight sm:text-lg">
            {settings.site_name}
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
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <ThemeToggle />
          {user ? (
            <>
              {!isSuspended && (
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
              )}

              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setMobileOpen(false); setMenuOpen((v) => !v); }}
                  className="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-ink-100"
                  aria-label="Open account menu"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <Avatar name={profile?.full_name || 'User'} src={profile?.avatar_url} size={32} verified={profile?.role === 'driver' && profile?.is_verified} />
                  <span className="hidden text-sm font-medium text-ink-800 sm:block">
                    {profile?.full_name?.split(' ')[0]}
                  </span>
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div role="menu" className="absolute right-0 top-12 z-20 w-56 animate-scale-in overflow-hidden rounded-xl bg-white py-1 shadow-card-hover ring-1 ring-ink-200 dark:bg-[#141416]">
                      <div className="border-b border-ink-100 px-4 py-3">
                        <p className="truncate text-sm font-semibold text-ink-900">{profile?.full_name}</p>
                        <p className="text-xs capitalize text-ink-500">{profile?.role}</p>
                      </div>
                      {!isAdmin && user && <MenuItem to={`/members/${user.id}`} icon={<User className="h-4 w-4" />}>View profile</MenuItem>}
                      {isAdmin && <div className="md:hidden"><MenuItem to="/admin" icon={<LayoutDashboard className="h-4 w-4" />}>Admin dashboard</MenuItem></div>}
                      <div className="hidden md:block">
                        {!isSuspended && (
                          <>
                          {isAdmin ? (
                            <MenuItem to="/admin" icon={<LayoutDashboard className="h-4 w-4" />}>Admin dashboard</MenuItem>
                          ) : (
                            <>
                              <MenuItem to="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />}>Dashboard</MenuItem>
                              <MenuItem to="/saved" icon={<Heart className="h-4 w-4" />}>Saved listings</MenuItem>
                              <MenuItem to="/settings" icon={<Settings className="h-4 w-4" />}>Settings</MenuItem>
                            </>
                          )}
                          <MenuItem to="/help" icon={<LifeBuoy className="h-4 w-4" />}>Help center</MenuItem>
                          </>
                        )}
                        <button
                          onClick={async () => { await signOut(); navigate('/'); }}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-danger hover:bg-red-50"
                        >
                          <LogOut className="h-4 w-4" /> Sign out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link to="/login" className="btn-ghost">Sign in</Link>
              <Link to="/register" className="btn-primary hidden sm:inline-flex">Get started</Link>
            </div>
          )}

          <button
            type="button"
            className="rounded-full p-2 text-ink-700 hover:bg-ink-100 md:hidden"
            onClick={() => { setMenuOpen(false); setMobileOpen((v) => !v); }}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div id="mobile-navigation" className="border-t border-ink-100 bg-white dark:bg-[#0b0b0d] md:hidden">
          <div className="container-content flex flex-col py-3">
            {navLinks.map((l) => (
              <Link key={l.to} to={l.to} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-100">
                {l.icon && <l.icon className="h-4 w-4" />}
                {l.label}
              </Link>
            ))}
            {user && (
              <div className="mt-2 border-t border-ink-100 pt-2">
                <p className="px-3 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-ink-400">Account</p>
                {mobileAccountLinks.map((item) => (
                  <Link key={item.to} to={item.to} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-100">
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={async () => { await signOut(); navigate('/'); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-danger hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}
            {!user && (
              <div className="mt-2 flex gap-2 border-t border-ink-100 pt-3">
                <Link to="/login" className="btn-secondary flex-1">Sign in</Link>
                <Link to="/register" className="btn-primary flex-1">Get started</Link>
              </div>
            )}
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
