import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Menu, X, Bell, LogOut, LayoutDashboard, Heart, Settings, LifeBuoy, User } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useSiteSettings } from '@/lib/siteSettings';
import { ThemeToggle } from './ThemeToggle';
import { SiteLogo } from './SiteLogo';
import { NOTIFICATIONS_CHANGED_EVENT } from '@/lib/notificationEvents';
import { usePromotionLive } from '@/lib/promotionLive';

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
  const { enabled: promotionsEnabled } = usePromotionLive();
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
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
    setNavigationOpen(false);
  }, [location.key, user?.id]);

  useEffect(() => {
    if (!navigationOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) setNavigationOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNavigationOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [navigationOpen]);

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

  const accountLinks = isSuspended
    ? []
    : isAdmin
      ? [
          { to: '/admin', label: 'Admin dashboard', icon: LayoutDashboard },
          { to: '/help', label: 'Help center', icon: LifeBuoy },
        ]
      : [
          { to: `/members/${user?.id}`, label: 'View profile', icon: User },
          { to: '/saved', label: 'Saved listings', icon: Heart },
          { to: '/settings', label: 'Settings', icon: Settings },
          ...(promotionsEnabled ? [{ to: '/promotions', label: 'Promotions', icon: LayoutDashboard }] : []),
          { to: '/help', label: 'Help center', icon: LifeBuoy },
        ];

  return (
    <header ref={headerRef} className="sticky top-0 z-50 border-b border-ink-100 bg-white/90 backdrop-blur-md dark:bg-[#0b0b0d]/90">
      <div className="container-content flex h-16 items-center justify-between gap-2 sm:gap-4">
        <Link to="/" aria-label={`${settings.site_name} home`} className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <SiteLogo />
          <span className="site-wordmark truncate font-display text-base font-extrabold tracking-tight sm:text-lg">
            {settings.site_name}
          </span>
        </Link>

        <nav className={cn('hidden items-center gap-1', user ? 'md:flex' : 'lg:flex')}>
          {navLinks.filter((l) => l.to !== '/dashboard').map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors',
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
            </>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link to="/login" className="btn-ghost">Sign in</Link>
              <Link to="/register" className="btn-primary hidden sm:inline-flex">Get started</Link>
            </div>
          )}

          <button
            ref={menuButtonRef}
            type="button"
            className={cn('flex h-11 w-11 items-center justify-center rounded-full text-ink-700 hover:bg-ink-100', !user && 'lg:hidden')}
            onClick={() => setNavigationOpen((v) => !v)}
            aria-label={navigationOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={navigationOpen}
            aria-controls="account-navigation"
          >
            {navigationOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {navigationOpen && (
        <nav id="account-navigation" aria-label="Account and navigation" className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-t border-ink-100 bg-white shadow-card-hover dark:bg-[#0b0b0d] md:left-auto md:right-4 md:top-[calc(100%+0.5rem)] md:max-h-[calc(100dvh-5rem)] md:w-72 md:rounded-2xl md:border md:border-ink-100">
          <div className="container-content flex flex-col py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-3">
            {navLinks.map((l) => (
              <Link key={l.to} to={l.to} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-100">
                {l.icon && <l.icon className="h-4 w-4" />}
                {l.label}
              </Link>
            ))}
            {user && (
              <div className="mt-2 border-t border-ink-100 pt-2">
                <div className="px-3 py-2">
                  <p className="break-words text-sm font-semibold text-ink-900">{profile?.full_name || 'Your account'}</p>
                  <p className="text-xs text-ink-500">{isAdmin ? 'Administrator' : profile?.role === 'owner' ? 'Car owner' : profile?.role === 'driver' ? 'Driver' : 'Member'}</p>
                </div>
                {accountLinks.map((item) => (
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
        </nav>
      )}
    </header>
  );
}
