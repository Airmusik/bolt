import { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { useAuth } from '@/lib/useAuth';
import { useSiteSettings } from '@/lib/siteSettings';
import { DashboardNavigation } from './DashboardNavigation';

const SUSPENDED_ALLOWED = ['/', '/about', '/contact', '/terms', '/privacy', '/suspended', '/login', '/register'];

export function Layout({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const { settings } = useSiteSettings();
  const navigate = useNavigate();
  const location = useLocation();
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
    <div className={`flex min-h-screen flex-col ${showMemberNavigation ? '[--member-nav-height:7rem] sm:[--member-nav-height:4rem]' : '[--member-nav-height:0px]'}`}>
      <Header />
      {showMemberNavigation && <DashboardNavigation key={user.id} role={profile.role as 'owner' | 'driver'} userId={user.id} />}
      <main key={location.pathname} className="page-enter flex-1">{children}</main>
      <Footer />
    </div>
  );
}
