import { Link, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { LockKeyhole, Wrench } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/useAuth';
import { useSiteSettings } from '@/lib/siteSettings';
import { useSeo } from '@/lib/useSeo';

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
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage').then((module) => ({ default: module.NotificationsPage })));
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
  useSeo();
  const { profile, loading: authLoading } = useAuth();
  const { settings, loading } = useSiteSettings();
  const path = window.location.pathname;
  const adminAllowed = path.startsWith('/admin') || path === '/auth/callback' || profile?.role === 'admin';

  // Never mount guest/default actions while restoring a member's account or
  // loading admin-controlled branding/settings. Applies to every route.
  if (authLoading || loading) {
    return <div role="status" aria-live="polite" className="flex min-h-screen items-center justify-center bg-orange-50/40 dark:bg-[#0b0b0d]">
      <span className="sr-only">Loading…</span>
      <span aria-hidden="true" className="h-7 w-7 rounded-full border-2 border-orange-200 border-t-orange-500 motion-safe:animate-spin dark:border-orange-950 dark:border-t-orange-400" />
    </div>;
  }

  if (!loading && settings.maintenance_mode === 'true' && !adminAllowed) {
    return (
      <Layout>
        <div className="container-content flex min-h-[70vh] flex-col items-center justify-center py-16 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
            <Wrench className="h-8 w-8" />
          </span>
          <h1 className="font-display text-3xl font-bold text-ink-900">{settings.site_name} is under maintenance</h1>
          <p className="mt-3 max-w-md text-ink-600">We're making updates right now. Please check back soon.</p>
          <Link to="/admin/login" className="btn-secondary mt-8">
            <LockKeyhole className="h-4 w-4" /> Admin sign in
          </Link>
          <p className="mt-2 text-xs text-ink-400">Platform administrators can continue managing the site during maintenance.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Suspense fallback={<div role="status" className="min-h-48"><span className="sr-only">Loading page…</span></div>}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/register" element={<RegisterPage />} />
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
        <Route path="/vehicles/new" element={<ProtectedRoute roles={['owner']}><VehicleFormPage /></ProtectedRoute>} />
        <Route path="/vehicles/:id/edit" element={<ProtectedRoute roles={['owner']}><VehicleFormPage /></ProtectedRoute>} />
        <Route path="/onboarding" element={<ProtectedRoute roles={['driver']}><DriverOnboardingPage /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="/chat/:conversationId" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
        <Route path="/saved" element={<ProtectedRoute><SavedPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="/promotions" element={<ProtectedRoute roles={['owner', 'driver']}><PromotionsPage /></ProtectedRoute>} />
        <Route path="/suspended" element={<ProtectedRoute><SuspendedPage /></ProtectedRoute>} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<ProtectedRoute roles={['admin']}><AdminPage /></ProtectedRoute>} />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
    </Layout>
  );
}
