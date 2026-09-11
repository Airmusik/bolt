import { Link, Routes, Route } from 'react-router-dom';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Wrench } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/useAuth';
import { useSiteSettings } from '@/lib/siteSettings';
import { useSeo } from '@/lib/useSeo';
import { SecurityDeviceTracker } from '@/components/SecurityDeviceTracker';
import { AdminMfaGate } from '@/components/AdminMfaGate';
import { SiteAssistant } from '@/components/SiteAssistant';
import { LaunchIntro } from '@/components/LaunchIntro';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { useLocation } from 'react-router-dom';

const HomePage = lazy(() => import('@/pages/HomePage').then((module) => ({ default: module.HomePage })));
const LoginPage = lazy(() => import('@/pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage').then((module) => ({ default: module.ResetPasswordPage })));
const RegisterPage = lazy(() => import('@/pages/RegisterPage').then((module) => ({ default: module.RegisterPage })));
const AuthCallbackPage = lazy(() => import('@/pages/AuthCallbackPage').then((module) => ({ default: module.AuthCallbackPage })));
const BrowseCarsPage = lazy(() => import('@/pages/BrowseCarsPage').then((module) => ({ default: module.BrowseCarsPage })));
const BrowseDriversPage = lazy(() => import('@/pages/BrowseDriversPage').then((module) => ({ default: module.BrowseDriversPage })));
const VehicleDetailsPage = lazy(() => import('@/pages/VehicleDetailsPage').then((module) => ({ default: module.VehicleDetailsPage })));
const DriverProfilePage = lazy(() => import('@/pages/DriverProfilePage').then((module) => ({ default: module.DriverProfilePage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const VehicleFormPage = lazy(() => import('@/pages/VehicleFormPage').then((module) => ({ default: module.VehicleFormPage })));
const DriverOnboardingPage = lazy(() => import('@/pages/DriverOnboardingPage').then((module) => ({ default: module.DriverOnboardingPage })));
const ChatPage = lazy(() => import('@/pages/ChatPage').then((module) => ({ default: module.ChatPage })));
const CommunityPage = lazy(() => import('@/pages/CommunityPage').then((module) => ({ default: module.CommunityPage })));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage').then((module) => ({ default: module.NotificationsPage })));
const UpdatesPage = lazy(() => import('@/pages/UpdatesPage').then((module) => ({ default: module.UpdatesPage })));
const SavedPage = lazy(() => import('@/pages/SavedPage').then((module) => ({ default: module.SavedPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const PromotionsPage = lazy(() => import('@/pages/PromotionsPage').then((module) => ({ default: module.PromotionsPage })));
const HowItWorksPage = lazy(() => import('@/pages/HowItWorksPage').then((module) => ({ default: module.HowItWorksPage })));
const HelpPage = lazy(() => import('@/pages/HelpPage').then((module) => ({ default: module.HelpPage })));
const ContactPage = lazy(() => import('@/pages/ContactPage').then((module) => ({ default: module.ContactPage })));
const AboutPage = lazy(() => import('@/pages/AboutPage').then((module) => ({ default: module.AboutPage })));
const TermsPage = lazy(() => import('@/pages/TermsPage').then((module) => ({ default: module.TermsPage })));
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage').then((module) => ({ default: module.PrivacyPage })));
const AdminPage = lazy(() => import('@/pages/AdminPage').then((module) => ({ default: module.AdminPage })));
const AdminLoginPage = lazy(() => import('@/pages/AdminLoginPage').then((module) => ({ default: module.AdminLoginPage })));
const SuspendedPage = lazy(() => import('@/pages/SuspendedPage').then((module) => ({ default: module.SuspendedPage })));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })));

export default function App() {
  const route = useLocation();
  useSeo();
  const { profile, loading: authLoading } = useAuth();
  const { settings, loading } = useSiteSettings();
  const path = window.location.pathname;
  const installedAppLaunch = path === '/' && (
    window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    || new URLSearchParams(window.location.search).get('source') === 'pwa'
  );
  const [allowBackgroundVideo, setAllowBackgroundVideo] = useState(false);
  const [showLaunchIntro, setShowLaunchIntro] = useState(() => {
    if (window.location.pathname !== '/' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (installedAppLaunch) return true;
    try {
      if (sessionStorage.getItem('11drive-launch-intro-seen')) return false;
      sessionStorage.setItem('11drive-launch-intro-seen', 'true');
      return true;
    } catch { return true; }
  });
  const completeLaunchIntro = useCallback(() => setShowLaunchIntro(false), []);
  const launchOverlay = showLaunchIntro && (installedAppLaunch || settings.launch_intro_enabled === 'true') ? <LaunchIntro
    siteName={settings.site_name}
    nameColours={settings.header_name_colours}
    backgroundEnabled={settings.launch_intro_background_enabled === 'true'}
    backgroundType={settings.homepage_background_type}
    backgroundUrl={settings.homepage_background_url}
    backgroundPosition={`${settings.homepage_background_position_x}% ${settings.homepage_background_position_y}%`}
    overlayOpacity={Math.min(95, Math.max(20, Number(settings.homepage_background_overlay) || 78)) / 100}
    allowVideo={allowBackgroundVideo}
    onComplete={completeLaunchIntro}
  /> : null;
  const adminAllowed = path.startsWith('/admin') || path === '/auth/callback' || profile?.role === 'admin';
  const unavailable = (message: string) => <div className="container-content py-20 text-center"><h1 className="text-2xl font-bold text-ink-900">Temporarily unavailable</h1><p className="mt-3 text-ink-600">{message}</p><Link to="/" className="btn-secondary mt-6">Back to homepage</Link></div>;

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    setAllowBackgroundVideo(!reducedMotion && !connection?.saveData);
  }, []);

  // Never mount guest/default actions while restoring a member's account or
  // loading admin-controlled branding/settings. Applies to every route.
  if (authLoading || loading) {
    return <>
      {launchOverlay}
      <div role="status" aria-live="polite" className={`flex min-h-screen items-center justify-center dark:bg-[#0b0b0d] ${showLaunchIntro || installedAppLaunch ? 'bg-white' : 'bg-orange-50/40'}`}>
        <span className="sr-only">Loading…</span>
        {!showLaunchIntro && !installedAppLaunch && <span aria-hidden="true" className="h-7 w-7 rounded-full border-2 border-orange-200 border-t-orange-500 motion-safe:animate-spin dark:border-orange-950 dark:border-t-orange-400" />}
      </div>
    </>;
  }

  if (!loading && settings.maintenance_mode === 'true' && !adminAllowed) {
    const showBackground = settings.homepage_background_enabled === 'true' && Boolean(settings.homepage_background_url);
    const backgroundPosition = `${settings.homepage_background_position_x}% ${settings.homepage_background_position_y}%`;
    const overlayOpacity = Math.min(95, Math.max(20, Number(settings.homepage_background_overlay) || 78)) / 100;
    return (
      <Layout>
        <div className={showBackground ? 'relative isolate overflow-hidden' : ''}>
          {showBackground && <>
            <div className="pointer-events-none absolute inset-0 -z-20 overflow-hidden bg-ink-900" aria-hidden="true">
              {settings.homepage_background_type === 'video' && allowBackgroundVideo
                ? <video src={settings.homepage_background_url} autoPlay muted loop playsInline preload="metadata" className="h-full w-full object-cover" style={{ objectPosition: backgroundPosition }} />
                : settings.homepage_background_type === 'image'
                  ? <img src={settings.homepage_background_url} alt="" loading="eager" decoding="async" className="h-full w-full object-cover" style={{ objectPosition: backgroundPosition }} />
                  : null}
            </div>
            <div className="pointer-events-none absolute inset-0 -z-10 bg-white dark:bg-[#0b0b0d]" style={{ opacity: overlayOpacity }} aria-hidden="true" />
          </>}
          <div className="container-content flex min-h-[70vh] items-center justify-center py-16 text-center">
            <div className="flex max-w-xl flex-col items-center rounded-3xl border border-white/40 bg-white/75 px-6 py-10 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-[#111114]/80 sm:px-12">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                <Wrench className="h-8 w-8" />
              </span>
              <h1 className="mt-6 font-display text-3xl font-bold text-ink-900">{settings.site_name} is under maintenance</h1>
              <p className="mt-3 max-w-md text-ink-600">{settings.maintenance_message}</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <>
      {launchOverlay}
      <Layout>
      <SecurityDeviceTracker />
      <SiteAssistant />
      <AppErrorBoundary key={route.pathname}><Suspense fallback={<div role="status" className="min-h-48"><span className="sr-only">Loading page…</span></div>}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/register" element={settings.registration_enabled === 'true' ? <RegisterPage /> : unavailable('New registrations are currently paused. Please check back later.')} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/browse-cars" element={<BrowseCarsPage />} />
        <Route path="/browse-drivers" element={<BrowseDriversPage />} />
        <Route path="/vehicles/:id" element={<VehicleDetailsPage />} />
        <Route path="/drivers/:id" element={<DriverProfilePage />} />
        <Route path="/members/:id" element={<DriverProfilePage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />

        <Route path="/dashboard" element={<ProtectedRoute roles={['owner', 'driver']}><DashboardPage /></ProtectedRoute>} />
        <Route path="/community" element={<ProtectedRoute roles={['owner','driver','admin']}><CommunityPage /></ProtectedRoute>} />
        <Route path="/vehicles/new" element={<ProtectedRoute roles={['owner']}>{settings.new_listings_enabled === 'true' ? <VehicleFormPage /> : unavailable('New vehicle listings are currently paused.')}</ProtectedRoute>} />
        <Route path="/vehicles/:id/edit" element={<ProtectedRoute roles={['owner']}><VehicleFormPage /></ProtectedRoute>} />
        <Route path="/onboarding" element={<ProtectedRoute roles={['driver']}><DriverOnboardingPage /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="/chat/:conversationId" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
        <Route path="/updates" element={<ProtectedRoute><UpdatesPage /></ProtectedRoute>} />
        <Route path="/saved" element={<ProtectedRoute><SavedPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="/promotions" element={<ProtectedRoute roles={['owner', 'driver']}><PromotionsPage /></ProtectedRoute>} />
        <Route path="/suspended" element={<ProtectedRoute><SuspendedPage /></ProtectedRoute>} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<ProtectedRoute roles={['admin']}><AdminMfaGate><AdminPage /></AdminMfaGate></ProtectedRoute>} />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense></AppErrorBoundary>
    </Layout>
    </>
  );
}
