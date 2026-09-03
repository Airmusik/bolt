import { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { useAuth } from '@/lib/useAuth';
import { useSiteSettings } from '@/lib/siteSettings';
import { DashboardNavigation } from './DashboardNavigation';
import { ActionAd } from './AdSlot';
import { SiteAnalyticsTracker } from './SiteAnalyticsTracker';

const SUSPENDED_ALLOWED = ['/', '/about', '/contact', '/terms', '/privacy', '/suspended', '/login', '/register'];

export function Layout({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const { settings } = useSiteSettings();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    // Page changes must not inherit the footer's scroll position. Query-only
    // navigation and authentication refreshes leave the current page alone.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [location.pathname]);
  const showMemberNavigation = user && profile && user.id === profile.id
    && (profile.role === 'driver' || profile.role === 'owner') && !profile.is_suspended
    && settings.maintenance_mode !== 'true'
    && !['/login', '/register', '/reset-password', '/suspended'].includes(location.pathname)
    && !location.pathname.startsWith('/admin');

  useEffect(() => {
    if (profile?.is_suspended && !SUSPENDED_ALLOWED.includes(location.pathname)) {
      navigate('/suspended', { replace: true });
    }
  }, [profile?.is_suspended, location.pathname, navigate]);

  return (
    <div className={`flex min-h-screen flex-col ${showMemberNavigation ? '[--member-nav-height:10.25rem] sm:[--member-nav-height:6.25rem]' : '[--member-nav-height:0px]'}`}>
      <Header />
      <SiteAnalyticsTracker />
      {showMemberNavigation && <DashboardNavigation key={user.id} role={profile.role as 'owner' | 'driver'} userId={user.id} />}
      <ActionAd />
      <main key={location.pathname} className={location.pathname.startsWith('/chat') || location.pathname.startsWith('/admin') ? 'flex-1' : 'page-enter flex-1'}>{children}</main>
      <Footer key={`footer:${location.pathname}`} />
    </div>
  );
}
