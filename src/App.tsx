import { Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';

import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { BrowseCarsPage } from '@/pages/BrowseCarsPage';
import { BrowseDriversPage } from '@/pages/BrowseDriversPage';
import { VehicleDetailsPage } from '@/pages/VehicleDetailsPage';
import { DriverProfilePage } from '@/pages/DriverProfilePage';
import { DashboardPage } from '@/pages/DashboardPage';
import { VehicleFormPage } from '@/pages/VehicleFormPage';
import { DriverOnboardingPage } from '@/pages/DriverOnboardingPage';
import { ChatPage } from '@/pages/ChatPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { SavedPage } from '@/pages/SavedPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { HowItWorksPage } from '@/pages/HowItWorksPage';
import { HelpPage } from '@/pages/HelpPage';
import { ContactPage } from '@/pages/ContactPage';
import { AboutPage } from '@/pages/AboutPage';
import { TermsPage } from '@/pages/TermsPage';
import { PrivacyPage } from '@/pages/PrivacyPage';
import { AdminPage } from '@/pages/AdminPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/browse-cars" element={<BrowseCarsPage />} />
        <Route path="/browse-drivers" element={<BrowseDriversPage />} />
        <Route path="/vehicles/:id" element={<VehicleDetailsPage />} />
        <Route path="/drivers/:id" element={<DriverProfilePage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />

        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/vehicles/new" element={<ProtectedRoute roles={['owner']}><VehicleFormPage /></ProtectedRoute>} />
        <Route path="/vehicles/:id/edit" element={<ProtectedRoute roles={['owner']}><VehicleFormPage /></ProtectedRoute>} />
        <Route path="/onboarding" element={<ProtectedRoute><DriverOnboardingPage /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="/chat/:conversationId" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
        <Route path="/saved" element={<ProtectedRoute><SavedPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute roles={['admin']}><AdminPage /></ProtectedRoute>} />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  );
}
