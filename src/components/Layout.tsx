import { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { useAuth } from '@/lib/auth';

const SUSPENDED_ALLOWED = ['/', '/about', '/contact', '/terms', '/privacy', '/suspended', '/login', '/register'];

export function Layout({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (profile?.is_suspended && !SUSPENDED_ALLOWED.includes(location.pathname)) {
      navigate('/suspended', { replace: true });
    }
  }, [profile?.is_suspended, location.pathname, navigate]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
