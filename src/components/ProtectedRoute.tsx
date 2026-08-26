import { Navigate, useLocation } from 'react-router-dom';
import { ReactNode } from 'react';
import { useAuth } from '@/lib/useAuth';
import { Loader2 } from 'lucide-react';

const SUSPENDED_ALLOWED = ['/suspended', '/about', '/contact', '/terms', '/privacy'];

export function ProtectedRoute({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (!profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }
  if (profile?.is_suspended && !SUSPENDED_ALLOWED.includes(location.pathname)) {
    return <Navigate to="/suspended" replace />;
  }
  if (profile.role === 'driver' && !profile.onboarding_completed && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" state={{ required: true }} replace />;
  }
  if (roles && !roles.includes(profile.role)) {
    return <Navigate to={profile.role === 'admin' ? '/admin' : '/dashboard'} replace />;
  }
  return <>{children}</>;
}
